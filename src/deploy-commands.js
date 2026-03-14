require('dotenv').config();
const { REST, Routes, SlashCommandBuilder } = require('discord.js');

if (!process.env.DISCORD_TOKEN || !process.env.CLIENT_ID || !process.env.GUILD_ID) {
  throw new Error('DISCORD_TOKEN / CLIENT_ID / GUILD_ID を .env に設定してください。');
}

const commands = [
  new SlashCommandBuilder()
    .setName('miq')
    .setDescription('指定ユーザーのアバターとテキストでMIQ画像を生成します')
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription('画像に使うユーザー')
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName('text')
        .setDescription('画像に表示する本文')
        .setRequired(true)
        .setMaxLength(1200)
    )
    .addStringOption((option) =>
      option
        .setName('type')
        .setDescription('画像タイプ')
        .setRequired(false)
        .addChoices(
          { name: 'normal', value: 'normal' },
          { name: 'color', value: 'color' },
          { name: 'reverse', value: 'reverse' },
          { name: 'reverseColor', value: 'reverseColor' },
          { name: 'white', value: 'white' },
          { name: 'reverseWhite', value: 'reverseWhite' }
        )
    ),

    new SlashCommandBuilder()
    .setName('goroku')
    .setDescription('サーバ語録画像を生成します')
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription('画像に使うユーザー')
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName('text')
        .setDescription('画像に表示する本文')
        .setRequired(true)
        .setMaxLength(1200)
    )
    .addStringOption((option) =>
      option
        .setName('type')
        .setDescription('画像タイプ')
        .setRequired(false)
        .addChoices(
          { name: 'normal', value: 'normal' },
          { name: 'color', value: 'color' },
          { name: 'reverse', value: 'reverse' },
          { name: 'reverseColor', value: 'reverseColor' },
          { name: 'white', value: 'white' },
          { name: 'reverseWhite', value: 'reverseWhite' }
        )
    )
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log('ギルドコマンドを登録します...');
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands }
    );
    console.log('登録完了');
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
})();
