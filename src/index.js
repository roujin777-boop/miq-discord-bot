require('dotenv').config();

const express = require('express');
const {
  Client,
  GatewayIntentBits,
  Events,
  AttachmentBuilder
} = require('discord.js');
const {
  createCanvas,
  loadImage,
  GlobalFonts
} = require('@napi-rs/canvas');

const PORT = Number(process.env.PORT || 3000);
const WIDTH = 1200;
const HEIGHT = 630;
const MAX_TEXT_CHARS = 1200;

const ALLOWED_TYPES = new Set([
  'normal',
  'color',
  'reverse',
  'reverseColor',
  'white',
  'reverseWhite'
]);

const app = express();
app.get('/', (_req, res) => {
  res.status(200).send('MIQ bot is running.');
});
app.listen(PORT, () => {
  console.log(`Health server listening on :${PORT}`);
});

if (!process.env.DISCORD_TOKEN) {
  throw new Error('DISCORD_TOKEN を設定してください。');
}

try {
  GlobalFonts.registerFromPath('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 'DejaVu Sans');
} catch (_e) {
  // フォント登録失敗時も継続
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

function escapeDisplayText(text) {
  return String(text || '').replaceAll('#', '＃').trim().slice(0, MAX_TEXT_CHARS);
}

function getTheme(type) {
  switch (type) {
    case 'color':
      return {
        bg: '#08111f',
        text: '#ffffff',
        subtext: 'rgba(255,255,255,0.82)',
        dividerShadow: true,
        avatarOnRight: false,
        overlay: 'rgba(7, 15, 28, 0.10)'
      };
    case 'reverse':
      return {
        bg: '#000000',
        text: '#ffffff',
        subtext: 'rgba(255,255,255,0.70)',
        dividerShadow: true,
        avatarOnRight: true,
        overlay: 'rgba(0, 0, 0, 0.08)'
      };
    case 'reverseColor':
      return {
        bg: '#111827',
        text: '#ffffff',
        subtext: 'rgba(255,255,255,0.74)',
        dividerShadow: true,
        avatarOnRight: true,
        overlay: 'rgba(15, 23, 42, 0.10)'
      };
    case 'white':
      return {
        bg: '#f5efe6',
        text: '#171717',
        subtext: 'rgba(23,23,23,0.62)',
        dividerShadow: false,
        avatarOnRight: false,
        overlay: 'rgba(255,255,255,0.10)'
      };
    case 'reverseWhite':
      return {
        bg: '#f3eadf',
        text: '#171717',
        subtext: 'rgba(23,23,23,0.62)',
        dividerShadow: false,
        avatarOnRight: true,
        overlay: 'rgba(255,255,255,0.10)'
      };
    case 'normal':
    default:
      return {
        bg: '#000000',
        text: '#ffffff',
        subtext: 'rgba(255,255,255,0.70)',
        dividerShadow: true,
        avatarOnRight: false,
        overlay: 'rgba(0, 0, 0, 0.08)'
      };
  }
}

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function wrapChars(ctx, text, maxWidth, maxLines) {
  const chars = [...text];
  const lines = [];
  let line = '';

  for (const ch of chars) {
    if (ch === '\n') {
      lines.push(line);
      line = '';
      if (lines.length >= maxLines) break;
      continue;
    }

    const test = line + ch;
    const width = ctx.measureText(test).width;

    if (width > maxWidth && line.length > 0) {
      lines.push(line);
      line = ch;
      if (lines.length >= maxLines) break;
    } else {
      line = test;
    }
  }

  if (lines.length < maxLines && line) {
    lines.push(line);
  }

  if (lines.length === 0) {
    lines.push('');
  }

  if (lines.length > maxLines) {
    lines.length = maxLines;
  }

  return lines;
}

function fitTextLines(ctx, text, maxWidth, maxHeight, startSize, minSize, maxLines, weight = 700) {
  let fontSize = startSize;
  let lines = [];

  while (fontSize >= minSize) {
    ctx.font = `${weight} ${fontSize}px "DejaVu Sans", sans-serif`;
    lines = wrapChars(ctx, text, maxWidth, maxLines);
    const lineHeight = fontSize * 1.28;
    const totalHeight = lines.length * lineHeight;

    const tooWide = lines.some((line) => ctx.measureText(line).width > maxWidth + 1);
    const tooTall = totalHeight > maxHeight;

    if (!tooWide && !tooTall) {
      return { fontSize, lines, lineHeight };
    }

    fontSize -= 2;
  }

  ctx.font = `${weight} ${minSize}px "DejaVu Sans", sans-serif`;
  lines = wrapChars(ctx, text, maxWidth, maxLines);

  if (lines.length > 0) {
    let last = lines[lines.length - 1];
    while (last.length > 1 && ctx.measureText(`${last}…`).width > maxWidth) {
      last = last.slice(0, -1);
    }
    lines[lines.length - 1] = `${last}…`;
  }

  return {
    fontSize: minSize,
    lines,
    lineHeight: minSize * 1.28
  };
}

function drawSoftBackground(ctx, theme) {
  ctx.fillStyle = '#0b0d14';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const bg = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  bg.addColorStop(0, theme.overlay);
  bg.addColorStop(1, 'rgba(255,255,255,0.00)');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.fillStyle = 'rgba(255,255,255,0.04)';
  ctx.beginPath();
  ctx.arc(140, 90, 220, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.arc(WIDTH - 80, HEIGHT - 40, 260, 0, Math.PI * 2);
  ctx.fill();
}

async function drawAvatarPanel(ctx, avatarUrl, avatarX, avatarY, avatarW, avatarH) {
  try {
    const avatar = await loadImage(avatarUrl);

    ctx.save();
    roundRect(ctx, avatarX, avatarY, avatarW, avatarH, 26);
    ctx.clip();

    const scale = Math.max(avatarW / avatar.width, avatarH / avatar.height);
    const drawW = avatar.width * scale;
    const drawH = avatar.height * scale;
    const drawX = avatarX + (avatarW - drawW) / 2;
    const drawY = avatarY + (avatarH - drawH) / 2;

    ctx.drawImage(avatar, drawX, drawY, drawW, drawH);

    const fade = ctx.createLinearGradient(avatarX, avatarY, avatarX + avatarW, avatarY);
    fade.addColorStop(0, 'rgba(255,255,255,0.04)');
    fade.addColorStop(1, 'rgba(0,0,0,0.10)');
    ctx.fillStyle = fade;
    ctx.fillRect(avatarX, avatarY, avatarW, avatarH);

    ctx.restore();
  } catch (_e) {
    ctx.fillStyle = '#3a3a3a';
    roundRect(ctx, avatarX, avatarY, avatarW, avatarH, 26);
    ctx.fill();
  }
}

async function renderMiq({ avatarUrl, displayName, username, userId, text, type }) {
  const theme = getTheme(type);
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');

  drawSoftBackground(ctx, theme);

  roundRect(ctx, 14, 14, WIDTH - 28, HEIGHT - 28, 18);
  ctx.fillStyle = '#0c0d11';
  ctx.fill();

  roundRect(ctx, 26, 26, WIDTH - 52, HEIGHT - 52, 20);
  ctx.fillStyle = theme.bg;
  ctx.fill();

  const panelY = 26;
  const panelH = HEIGHT - 52;
  const avatarPanelW = 480;
  const textPanelX = 26 + avatarPanelW;
  const textPanelW = WIDTH - 52 - avatarPanelW;

  let avatarX = 26;
  let textX = textPanelX;

  if (theme.avatarOnRight) {
    avatarX = WIDTH - 26 - avatarPanelW;
    textX = 26;
  }

  await drawAvatarPanel(ctx, avatarUrl, avatarX, panelY, avatarPanelW, panelH);

  if (theme.dividerShadow) {
    const shadowX = theme.avatarOnRight ? avatarX - 40 : avatarX + avatarPanelW - 40;
    const shadow = ctx.createLinearGradient(shadowX, 0, shadowX + 80, 0);
    if (theme.avatarOnRight) {
      shadow.addColorStop(0, 'rgba(0,0,0,0)');
      shadow.addColorStop(1, 'rgba(0,0,0,0.35)');
    } else {
      shadow.addColorStop(0, 'rgba(0,0,0,0.35)');
      shadow.addColorStop(1, 'rgba(0,0,0,0)');
    }
    ctx.fillStyle = shadow;
    ctx.fillRect(shadowX, panelY, 80, panelH);
  }

  const centerX = textX + textPanelW / 2;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // 本文
  const quoteMaxWidth = Math.min(420, textPanelW - 90);
  const quoteMaxHeight = 170;
  const safeText = text && text.trim() ? text.trim() : ' ';
  const quoteLayout = fitTextLines(
    ctx,
    safeText,
    quoteMaxWidth,
    quoteMaxHeight,
    56,
    32,
    3,
    700
  );

  ctx.fillStyle = theme.text;
  ctx.font = `700 ${quoteLayout.fontSize}px "DejaVu Sans", sans-serif`;

  const totalTextHeight = quoteLayout.lines.length * quoteLayout.lineHeight;
  const quoteBaseY = 210 - totalTextHeight / 2 + quoteLayout.lineHeight / 2;

  quoteLayout.lines.forEach((line, index) => {
    ctx.fillText(line, centerX, quoteBaseY + index * quoteLayout.lineHeight, quoteMaxWidth + 20);
  });

  // displayName（主役）
  const nameMaxWidth = Math.min(440, textPanelW - 80);
  const nameLayout = fitTextLines(
    ctx,
    displayName || username,
    nameMaxWidth,
    90,
    42,
    24,
    2,
    700
  );

  ctx.fillStyle = theme.text;
  ctx.font = `700 ${nameLayout.fontSize}px "DejaVu Sans", sans-serif`;

  const nameTotalHeight = nameLayout.lines.length * nameLayout.lineHeight;
  const nameBaseY = 360 - nameTotalHeight / 2 + nameLayout.lineHeight / 2;

  nameLayout.lines.forEach((line, index) => {
    ctx.fillText(line, centerX, nameBaseY + index * nameLayout.lineHeight, nameMaxWidth + 20);
  });

  // @username（小さめ）
  ctx.font = `500 24px "DejaVu Sans", sans-serif`;
  ctx.fillStyle = theme.subtext;
  ctx.fillText(`@${username}`, centerX, 445);

  // ID（さらに小さめ）
  ctx.font = `500 17px "DejaVu Sans", sans-serif`;
  ctx.fillStyle = theme.subtext;
  ctx.fillText(String(userId), centerX, 480);

  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `500 13px "DejaVu Sans", sans-serif`;
  ctx.fillStyle = theme.subtext;
  ctx.fillText('Blueberry Health BOT', WIDTH - 34, HEIGHT - 22);

  return canvas.encode('png');
}

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== 'miq') return;

  const user = interaction.options.getUser('user', true);
  const member = interaction.options.getMember('user');
  const type = interaction.options.getString('type') || 'normal';
  const rawText = interaction.options.getString('text', true);
  const text = escapeDisplayText(rawText);

  if (!ALLOWED_TYPES.has(type)) {
    await interaction.reply({
      content: 'type が不正です。',
      ephemeral: true
    });
    return;
  }

  if (!text) {
    await interaction.reply({
      content: 'text を入力してください。',
      ephemeral: true
    });
    return;
  }

  await interaction.deferReply();

  try {
    const avatarUrl = user.displayAvatarURL({
      extension: 'png',
      forceStatic: true,
      size: 1024
    });

    const resolvedDisplayName =
      member && typeof member.displayName === 'string'
        ? member.displayName
        : user.globalName || user.username;

    const pngBuffer = await renderMiq({
      avatarUrl,
      displayName: resolvedDisplayName,
      username: user.username,
      userId: user.id,
      text,
      type
    });

    const attachment = new AttachmentBuilder(pngBuffer, { name: 'miq.png' });

    await interaction.editReply({
      files: [attachment]
    });
  } catch (error) {
    console.error(error);
    await interaction.editReply({
      content: '画像生成に失敗しました。ログを確認してください。'
    });
  }
});

client.login(process.env.DISCORD_TOKEN);
