const { ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder, ChatInputCommandInteraction } = require('discord.js');
const ShortUniqueId = require('short-unique-id');
const Keyv = require('keyv');
const deepl = require('deepl'); // 导入deepl模块
const logger = require('../logger');
const fs = require('fs');


async function translate_to_english(text) {
    // 判断字符串是否包含中文字符
    for (let char of text) {
        if ('\u4e00' <= char && char <= '\u9fff') {
            const api_key = 'd4462d35-a54d-0caa-ff7d-097b3812fc92:fx';
            const resp = await fetch('https://api-free.deepl.com/v2/translate', {
                method: 'POST',
                headers: {
                    'Authorization': 'DeepL-Auth-Key d4462d35-a54d-0caa-ff7d-097b3812fc92:fx',
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: `text=${text}&target_lang=EN-GB`
            });

            const translate = await resp.json();
            logger.info(translate);
            return translate.translations[0].text; // 返回翻译后的英文字符串
        }
    }
    return text; // 不包含中文，直接返回原字符串
}


module.exports = {
    data: new SlashCommandBuilder()
        .setName('draw')
        .setDescription('生成图片')
        .addStringOption(option => option
            .setName('prompt')
            .setDescription('prompt')
            .setRequired(true))
        .addIntegerOption(option => option
            .setName('pics')
            .setDescription('batch_size')
            .setMinValue(1)
            .setMaxValue(9))
        .addIntegerOption(option => option
            .setName('steps')
            .setDescription('steps')
            .setMinValue(1)
            .setMaxValue(50))
        .addNumberOption(option => option
            .setName('denoising')
            .setDescription('denoising_strength')
            .setMinValue(0)
            .setMaxValue(1))
        .addStringOption(option => option
            .setName('negative')
            .setDescription('negative_prompt'))
        .addIntegerOption(option => option
            .setName('width')
            .setDescription('width')
            .setMinValue(1)
            .setMaxValue(1024))
        .addIntegerOption(option => option
            .setName('height')
            .setDescription('height')
            .setMinValue(1)
            .setMaxValue(1024))
        .addBooleanOption(option => option
            .setName('enable_controlnet')
            .setDescription('enable controlnet, default: false, currently support 1'))
        .addStringOption(option => option
            .setName('input_image')
            .setDescription('input image url for control net'))
        .addStringOption(option => option
            .setName('module')
            .setDescription('module used for controlnet preprocessing'))
        .addStringOption(option => option
            .setName('model')
            .setDescription('model used for controlnet'))
        .addNumberOption(option => option
            .setName('weight')
            .setDescription('weight for this controlnet unit, default: 1')
            .setMinValue(0))
        .addIntegerOption(option => option
            .setName('resize_mode')
            .setDescription('how to resize the input image so as to fit the output resolution of the generation.')
            .setMaxValue(2)
            .setMinValue(0)),
    // 别的controlnet参数先不加了
    /**
     * 
     * @param {ChatInputCommandInteraction} interaction 
     */
    async execute(interaction) {
        const keyv = new Keyv('rediss://clustercfg.nonoko-redis.q7sou3.memorydb.ap-northeast-1.amazonaws.com:6379');

        const prompt = await translate_to_english(interaction.options.getString('prompt'));
        const batch_size = interaction.options.getInteger('pics') ?? 4; // default = 2
        const steps = interaction.options.getInteger('steps') ?? 20;
        const denoising = interaction.options.getNumber('denoising') ?? 0.7;
        const negative_prompt = interaction.options.getString('negative') ?? "lowres, bad anatomy, bad hands, text, error, missing fingers, extra digit, fewer digits, cropped, worst quality, low quality, normal quality, jpeg artifacts, signature, watermark, username, blurry";
        const width = interaction.options.getInteger('width') ?? 512;
        const height = interaction.options.getInteger('height') ?? 768;
        const enable_controlnet = interaction.options.getBoolean('enable_controlnet') ?? false;
        const input_image = interaction.options.getString('input_image') ?? "";
        const module = interaction.options.getString('module') ?? "";
        const model = interaction.options.getString('model') ?? "";
        const weight = interaction.options.getNumber('weight') ?? 1;
        const resize_mode = interaction.options.getInteger('resize_mode') ?? 1;

        let controlNetUnitArgs;
        let base64Image;

        logger.info("start");

        await interaction.deferReply();

        if (enable_controlnet) {
            const imageFile = fs.createWriteStream('large-image.jpg');
            var _request = require('request');

            // 发送 HTTP GET 请求获取图片数据
            _request.get(input_image)
                .on('error', (err) => {
                    logger.error(err);
                })
                .on('response', (response) => {
                    // 获取响应头中的内容长度，以便后续处理
                    const contentLength = response.headers['content-length'];
                    logger.info(`Content length: ${contentLength}`);

                    // 如果图片内容长度小于 10MB，则直接将其转成 base64 编码
                    if (contentLength < 10 * 1024 * 1024) {
                        let imageData = '';
                        response.on('data', (chunk) => {
                            imageData += chunk;
                        });
                        response.on('end', () => {
                            base64Image = Buffer.from(imageData).toString('base64');
                        });
                    } else {
                        // 否则使用流式传输将图片存储到本地文件系统，并在完成后读取并转成 base64 编码
                        response.pipe(imageFile);
                        imageFile.on('finish', () => {
                            fs.readFile('large-image.jpg', (err, data) => {
                                if (err) throw err;
                                base64Image = Buffer.from(data).toString('base64');
                            });
                        });
                    }
                });

            controlNetUnitArgs = [{
                input_image: base64Image,
                module: module,
                model: model,
                weight: weight,
                resize_mode: resize_mode
            }]
        }

        const request = {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "accept": "application/json",
                "Authorization": process.env.AUTH
            },
            body: JSON.stringify({ // 其它参数暂时没加
                prompt: prompt,
                batch_size: batch_size,
                steps: steps,
                denoising_strength: denoising,
                negative_prompt: negative_prompt,
                restore_faces: true,
                hr_upscaler: "Nearest",
                sampler_name: "DPM++ 2M Karras",
                width: width,
                height: height,
                alwayson_scripts: {
                    controlnet: {
                        args: controlNetUnitArgs
                    }
                }
            })
        };
        const uid = new ShortUniqueId();
        const uuid = uid();
        keyv.set(uuid, request.body);
        logger.info(request.body);
        const response = await fetch('http://121.41.44.246:8080/sdapi/v1/txt2img', request);
        const data = await response.json();

        const generateNewBtn = new ButtonBuilder()
            .setCustomId(`generateNew-${uuid}`)
            .setLabel('Generate New')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('🔃');

        const actionRow = new ActionRowBuilder()
            .addComponents(generateNewBtn);
        logger.info(`key:${uuid}`);
        logger.info(data.parameters);
        const buff = [];
        for (let i = 0; i < data.images.length; i++) {
            const pic = data.images[i];
            keyv.set(`image-${uuid}-${i}`, pic);
            newBtn = new ButtonBuilder()
                .setCustomId(`upscale-${uuid}-${i}`)
                .setLabel(`Upscale ${i}`)
                .setStyle(ButtonStyle.Primary)
                .setEmoji('⬆️');
            buff.push(Buffer.from(pic, 'base64'));
            actionRow.addComponents(newBtn);
        }
        await interaction.editReply({ content: `${interaction.user.username}'s drawing:`, files: buff, components: [actionRow] });
    }
}
