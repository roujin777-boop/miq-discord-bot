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
const PADDING_X = 72;
const PADDING_Y = 54;
const AVATAR_SIZE = 144;
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
  throw new Error('DISCORD_TOKEN を .env に設定してください。');
}

try {
  // 一部環境で日本語が出やすくなるよう汎用フォールバックを追加。なくても動作はします。
  GlobalFonts.registerFromPath('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 'DejaVu Sans');
} catch (_e) {
  // フォント登録失敗時も継続
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

function escapeDisplayText(text) {
  return text.replaceAll('#', '＃').trim().slice(0, MAX_TEXT_CHARS);
}

function getTheme(type) {
  switch (type) {
    case 'color':
      return {
        background: '#111827',
        bubble: '#2563eb',
        text: '#ffffff',
        subtext: 'rgba(255,255,255,0.82)',
        accent: 'rgba(255,255,255,0.18)',
        quoteMark: 'rgba(255,255,255,0.24)',
        reverse: false
      };
    case 'reverse':
      return {
        background: '#0b0b0f',
        bubble: '#191a22',
        text: '#f5f5f5',
        subtext: 'rgba(255,255,255,0.72)',
        accent: 'rgba(255,255,255,0.10)',
        quoteMark: 'rgba(255,255,255,0.20)',
        reverse: true
      };
    case 'reverseColor':
      return {
        background: '#0f172a',
        bubble: '#7c3aed',
        text: '#ffffff',
        subtext: 'rgba(255,255,255,0.82)',
        accent: 'rgba(255,255,255,0.16)',
        quoteMark: 'rgba(255,255,255,0.24)',
        reverse: true
      };
    case 'white':
      return {
        background: '#f5f7fb',
        bubble: '#ffffff',
        text: '#111827',
        subtext: 'rgba(17,24,39,0.70)',
        accent: 'rgba(17,24,39,0.07)',
        quoteMark: 'rgba(17,24,39,0.12)',
        reverse: false
      };
    case 'reverseWhite':
      return {
        background: '#eef2f7',
        bubble: '#ffffff',
        text: '#111827',
        subtext: 'rgba(17,24,39,0.70)',
        accent: 'rgba(17,24,39,0.07)',
        quoteMark: 'rgba(17,24,39,0.12)',
        reverse: true
      };
    case 'normal':
    default:
      return {
        background: '#0b0b0f',
        bubble: '#12131a',
        text: '#ffffff',
        subtext: 'rgba(255,255,255,0.72)',
        accent: 'rgba(255,255,255,0.10)',
        quoteMark: 'rgba(255,255,255,0.18)',
        reverse: false
      };
  }
}

function roundRectPath(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function fitFontSize(ctx, text, maxWidth, startSize, minSize, weight = 700) {
  let size = startSize;
  while (size >= minSize) {
    ctx.font = `${weight} ${size}px "DejaVu Sans", sans-serif`;
    if (ctx.measureText(text).width <= maxWidth) return size;
    size -= 2;
  }
  return minSize;
}

function wrapText(ctx, text, maxWidth, maxLines) {
  const lines = [];
  const paragraphs = text.split(/\r?\n/);

  for (const paragraph of paragraphs) {
    const words = paragraph.split(/(\s+)/).filter(Boolean);
    if (words.length === 0) {
      lines.push('');
      continue;
    }

    let current = '';
    for (const word of words) {
      const testLine = current ? current + word : word.trimStart();
      if (ctx.measureText(testLine).width <= maxWidth) {
        current = testLine;
      } else {
        if (current) lines.push(current.trimEnd());
        current = word.trimStart();
      }

      if (lines.length >= maxLines) break;
    }

    if (lines.length < maxLines && current) {
      lines.push(current.trimEnd());
    }

    if (lines.length >= maxLines) break;
  }

  if (lines.length === 0) lines.push('');

  if (lines.length > maxLines) {
    lines.length = maxLines;
  }

  const lastIndex = lines.length - 1;
  const hasMoreContent = lines.length >= maxLines;
  if (hasMoreContent) {
    let last = lines[lastIndex].replace(/[\s　]+$/g, '');
    while (last.length > 1 && ctx.measureText(`${last}…`).width > maxWidth) {
      last = last.slice(0, -1);
    }
    lines[lastIndex] = `${last}…`;
  }

  return lines;
}

function drawBackground(ctx, theme) {
  ctx.fillStyle = theme.background;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const g1 = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  g1.addColorStop(0, 'rgba(255,255,255,0.05)');
  g1.addColorStop(1, 'rgba(255,255,255,0.00)');
  ctx.fillStyle = g1;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.fillStyle = theme.accent;
  ctx.beginPath();
  ctx.arc(120, 90, 180, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.arc(WIDTH - 80, HEIGHT - 60, 220, 0, Math.PI * 2);
  ctx.fill();
}

async function renderMiq({ avatarUrl, displayName, username, text, type }) {
  const theme = getTheme(type);
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');
  drawBackground(ctx, theme);

  const cardX = 36;
  const cardY = 36;
  const cardW = WIDTH - 72;
  const cardH = HEIGHT - 72;

  roundRectPath(ctx, cardX, cardY, cardW, cardH, 34);
  ctx.fillStyle = theme.bubble;
  ctx.fill();

  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  const isReverse = theme.reverse;
  const avatarX = isReverse ? WIDTH - PADDING_X - AVATAR_SIZE : PADDING_X;
  const avatarY = PADDING_Y;

  const textStartX = isReverse ? PADDING_X : PADDING_X + AVATAR_SIZE + 34;
  const textBoxWidth = WIDTH - (PADDING_X * 2) - AVATAR_SIZE - 34;

  try {
    const avatar = await loadImage(avatarUrl);
    ctx.save();
    ctx.beginPath();
    ctx.arc(avatarX + AVATAR_SIZE / 2, avatarY + AVATAR_SIZE / 2, AVATAR_SIZE / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(avatar, avatarX, avatarY, AVATAR_SIZE, AVATAR_SIZE);
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(avatarX + AVATAR_SIZE / 2, avatarY + AVATAR_SIZE / 2, AVATAR_SIZE / 2 - 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  } catch (_error) {
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.beginPath();
    ctx.arc(avatarX + AVATAR_SIZE / 2, avatarY + AVATAR_SIZE / 2, AVATAR_SIZE / 2, 0, Math.PI * 2);
    ctx.fill();
  }

  const nameY = PADDING_Y + 18;
  const handleY = nameY + 50;
  const quoteY = handleY + 62;

  const displayNameWidth = textBoxWidth - 10;
  const nameFontSize = fitFontSize(ctx, displayName, displayNameWidth, 42, 28, 700);
  ctx.font = `700 ${nameFontSize}px "DejaVu Sans", sans-serif`;
  ctx.fillStyle = theme.text;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(displayName, textStartX, nameY);

  const handle = `@${username}`;
  ctx.font = `500 26px "DejaVu Sans", sans-serif`;
  ctx.fillStyle = theme.subtext;
  ctx.fillText(handle, textStartX, handleY);

  ctx.font = `700 140px "DejaVu Sans", sans-serif`;
  ctx.fillStyle = theme.quoteMark;
  ctx.fillText('“', textStartX - 14, quoteY - 22);

  let quoteFontSize = 62;
  ctx.font = `700 ${quoteFontSize}px "DejaVu Sans", sans-serif`;
  let lines = wrapText(ctx, text, textBoxWidth, 5);

  while (quoteFontSize > 34) {
    const totalHeight = lines.length * (quoteFontSize * 1.25);
    const availableHeight = HEIGHT - quoteY - 90;
    const tooTall = totalHeight > availableHeight;
    const tooWide = lines.some((line) => ctx.measureText(line).width > textBoxWidth + 1);
    if (!tooTall && !tooWide) break;
    quoteFontSize -= 2;
    ctx.font = `700 ${quoteFontSize}px "DejaVu Sans", sans-serif`;
    lines = wrapText(ctx, text, textBoxWidth, 6);
  }

  ctx.font = `700 ${quoteFontSize}px "DejaVu Sans", sans-serif`;
  ctx.fillStyle = theme.text;

  const lineHeight = quoteFontSize * 1.25;
  lines.forEach((line, index) => {
    ctx.fillText(line, textStartX, quoteY + index * lineHeight);
  });

  ctx.font = `500 18px "DejaVu Sans", sans-serif`;
  ctx.fillStyle = theme.subtext;
  const footerText = 'Generated by /miq';
  const footerMetrics = ctx.measureText(footerText);
  const footerX = WIDTH - PADDING_X - footerMetrics.width;
  const footerY = HEIGHT - PADDING_Y + 8;
  ctx.fillText(footerText, footerX, footerY);

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
    const displayName = member && typeof member.displayName === 'string'
      ? member.displayName
      : (user.globalName || user.username);

    const avatarUrl = user.displayAvatarURL({
      extension: 'png',
      forceStatic: true,
      size: 512
    });

    const pngBuffer = await renderMiq({
      avatarUrl,
      displayName,
      username: user.username,
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
