const {ButtonBuilder, ButtonInteraction, ButtonStyle, ActionRowBuilder} = require('discord.js');
const ShortUniqueId = require('short-unique-id');
const Keyv = require('keyv');

const logger = require('../logger');


module.exports = {
    data: {
        name: 'generateNew'
    },

     /**
     * 
     * @param {ButtonInteraction} interaction 
     */
     async execute(interaction) {
        buttonId = interaction.component.customId;
        const old_uuid = buttonId.split('-')[1]
        const keyv = new Keyv('redis://clustercfg.nonoko-redis.q7sou3.memorydb.ap-northeast-1.amazonaws.com:6379');
        logger.info(`key:${old_uuid}`);
        const json = await keyv.get(old_uuid);
        logger.info(json);

        logger.info("start generate");

        await interaction.deferUpdate();


        const request = {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "accept": "application/json",
                "Authorization": process.env.AUTH
            },
            body: json
        };

        const response = await fetch('http://121.41.44.246:8080/sdapi/v1/txt2img', request);
        const data = await response.json();
        const uid = new ShortUniqueId();
        const uuid = uid();

        const generateNewBtn = new ButtonBuilder()
            .setCustomId(`generateNew-${uuid}`)    
            .setLabel('Generate New')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('🔃');
        
        const actionRow = new ActionRowBuilder()
            .addComponents(generateNewBtn)

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
        await interaction.editReply({ content: "generated new:", files: buff, components: [actionRow] });   
        keyv.set(uuid, json);
    }
}