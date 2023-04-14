const {ButtonBuilder, ButtonInteraction, ButtonStyle, ActionRowBuilder} = require('discord.js');
const ShortUniqueId = require('short-unique-id');
const Keyv = require('keyv');
const FormData = require('form-data');


module.exports = {
    data: {
        name: 'upscale'
    },

    /**
     * 
     * @param {ButtonInteraction} interaction 
     */
    async execute(interaction) {
        buttonId = interaction.component.customId;
        const old_uuid = buttonId.split('-')[1];
        const idx_pic = buttonId.split('-')[2];
        const keyv = new Keyv('redis://localhost:6379');
        console.log(`image-${old_uuid}-${idx_pic}`);
        const pic = await keyv.get(`image-${old_uuid}-${idx_pic}`);

        console.log("generate");

        await interaction.deferReply();

        const request = {
            method: 'POST',
            headers: {
              'X-API-KEY': 'wxnjcva3it2zn4l8l'
            },
            body: new FormData()
          };
          
          request.body.append('sync', '1');
          request.body.append('image_base64', pic);
          request.body.append('type', 'face');
          request.body.append('return_type', 2);
          
          console.log(JSON.stringify(request));
          
          const response = await fetch('https://techsz.aoscdn.com/api/tasks/visual/scale', request);
          


        const data = await response.json();
        console.log(data);
        const buff = [];

        buff.push(new Buffer.from(data.image, 'base64'));
        await interaction.editReply({ content: "Upscale result", files: buff});   
    }
}