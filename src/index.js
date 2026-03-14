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
const WIDTH = 1280;
const HEIGHT = 720;
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
  GlobalFonts.registerFromPath(
    '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
    'Noto Sans CJK JP'
  );
  GlobalFonts.registerFromPath(
    '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc',
    'Noto Sans CJK JP Bold'
  );
  console.log('Available fonts:', GlobalFonts.families);
} catch (e) {
  console.error('Font load failed:', e);
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
        bg: '#000000',
        text: '#ffffff',
        subtext: 'rgba(255,255,255,0.82)',
        avatarOnRight: false
      };
    case 'reverse':
      return {
        bg: '#000000',
        text: '#ffffff',
        subtext: 'rgba(255,255,255,0.72)',
        avatarOnRight: true
      };
    case 'reverseColor':
      return {
        bg: '#000000',
        text: '#ffffff',
        subtext: 'rgba(255,255,255,0.76)',
        avatarOnRight: true
      };
    case 'white':
      return {
        bg: '#f6efe5',
        text: '#171717',
        subtext: 'rgba(23,23,23,0.62)',
        avatarOnRight: false
      };
    case 'reverseWhite':
      return {
        bg: '#f6efe5',
        text: '#171717',
        subtext: 'rgba(23,23,23,0.62)',
        avatarOnRight: true
      };
    case 'normal':
    default:
      return {
        bg: '#000000',
        text: '#ffffff',
        subtext: 'rgba(255,255,255,0.72)',
        avatarOnRight: false
      };
  }
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
    ctx.font = `${weight} ${fontSize}px "Noto Sans CJK JP Bold"`;
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

  ctx.font = `${weight} ${minSize}px "Noto Sans CJK JP Bold"`;
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

async function drawAvatarPanel(ctx, avatarUrl, avatarX, avatarY, avatarW, avatarH) {
  try {
    const avatar = await loadImage(avatarUrl);

    // TakasumiBOT風に少し大きめ・少し左寄せ
    const scale = Math.max(avatarW / avatar.width, avatarH / avatar.height) * 1.08;
    const drawW = avatar.width * scale;
    const drawH = avatar.height * scale;
    const drawX = avatarX + (avatarW - drawW) / 2 - 36;
    const drawY = avatarY + (avatarH - drawH) / 2;

    ctx.drawImage(avatar, drawX, drawY, drawW, drawH);
  } catch (_e) {
    ctx.fillStyle = '#2f2f2f';
    ctx.fillRect(avatarX, avatarY, avatarW, avatarH);
  }
}

function drawDiagonalSeam(ctx, seamX, direction) {
  const isLTR = direction === 'left-to-right';

  // 1) 中央の黒い芯
  ctx.save();
  ctx.beginPath();
  if (isLTR) {
    ctx.moveTo(seamX - 22, 0);
    ctx.lineTo(seamX + 6, 0);
    ctx.lineTo(seamX + 36, HEIGHT);
    ctx.lineTo(seamX + 8, HEIGHT);
  } else {
    ctx.moveTo(seamX - 6, 0);
    ctx.lineTo(seamX + 22, 0);
    ctx.lineTo(seamX - 8, HEIGHT);
    ctx.lineTo(seamX - 36, HEIGHT);
  }
  ctx.closePath();
  ctx.fillStyle = 'rgba(0,0,0,0.92)';
  ctx.fill();
  ctx.restore();

  // 2) 左右に広がる暗いぼかし
  ctx.save();
  ctx.beginPath();
  if (isLTR) {
    ctx.moveTo(seamX - 70, 0);
    ctx.lineTo(seamX + 24, 0);
    ctx.lineTo(seamX + 104, HEIGHT);
    ctx.lineTo(seamX + 4, HEIGHT);
  } else {
    ctx.moveTo(seamX - 24, 0);
    ctx.lineTo(seamX + 70, 0);
    ctx.lineTo(seamX - 4, HEIGHT);
    ctx.lineTo(seamX - 104, HEIGHT);
  }
  ctx.closePath();

  const darkBlur = isLTR
    ? ctx.createLinearGradient(seamX - 70, 0, seamX + 104, 0)
    : ctx.createLinearGradient(seamX - 104, 0, seamX + 70, 0);

  if (isLTR) {
    darkBlur.addColorStop(0.00, 'rgba(0,0,0,0.00)');
    darkBlur.addColorStop(0.20, 'rgba(0,0,0,0.10)');
    darkBlur.addColorStop(0.45, 'rgba(0,0,0,0.28)');
    darkBlur.addColorStop(0.72, 'rgba(0,0,0,0.18)');
    darkBlur.addColorStop(1.00, 'rgba(0,0,0,0.00)');
  } else {
    darkBlur.addColorStop(0.00, 'rgba(0,0,0,0.00)');
    darkBlur.addColorStop(0.28, 'rgba(0,0,0,0.18)');
    darkBlur.addColorStop(0.55, 'rgba(0,0,0,0.28)');
    darkBlur.addColorStop(0.80, 'rgba(0,0,0,0.10)');
    darkBlur.addColorStop(1.00, 'rgba(0,0,0,0.00)');
  }

  ctx.fillStyle = darkBlur;
  ctx.fill();
  ctx.restore();

  // 3) 境界の内側に入る明るいにじみ
  ctx.save();
  ctx.beginPath();
  if (isLTR) {
    ctx.moveTo(seamX - 16, 0);
    ctx.lineTo(seamX + 42, 0);
    ctx.lineTo(seamX + 86, HEIGHT);
    ctx.lineTo(seamX + 18, HEIGHT);
  } else {
    ctx.moveTo(seamX - 42, 0);
    ctx.lineTo(seamX + 16, 0);
    ctx.lineTo(seamX - 18, HEIGHT);
    ctx.lineTo(seamX - 86, HEIGHT);
  }
  ctx.closePath();

  const lightGlow = isLTR
    ? ctx.createLinearGradient(seamX - 16, 0, seamX + 86, 0)
    : ctx.createLinearGradient(seamX - 86, 0, seamX + 16, 0);

  if (isLTR) {
    lightGlow.addColorStop(0.00, 'rgba(255,255,255,0.00)');
    lightGlow.addColorStop(0.35, 'rgba(255,255,255,0.07)');
    lightGlow.addColorStop(0.55, 'rgba(255,255,255,0.15)');
    lightGlow.addColorStop(0.78, 'rgba(255,255,255,0.04)');
    lightGlow.addColorStop(1.00, 'rgba(255,255,255,0.00)');
  } else {
    lightGlow.addColorStop(0.00, 'rgba(255,255,255,0.00)');
    lightGlow.addColorStop(0.22, 'rgba(255,255,255,0.04)');
    lightGlow.addColorStop(0.45, 'rgba(255,255,255,0.15)');
    lightGlow.addColorStop(0.65, 'rgba(255,255,255,0.07)');
    lightGlow.addColorStop(1.00, 'rgba(255,255,255,0.00)');
  }

  ctx.fillStyle = lightGlow;
  ctx.fill();
  ctx.restore();

  // 4) さらに外側へ薄く広がる霧
  ctx.save();
  ctx.beginPath();
  if (isLTR) {
    ctx.moveTo(seamX - 120, 0);
    ctx.lineTo(seamX + 36, 0);
    ctx.lineTo(seamX + 126, HEIGHT);
    ctx.lineTo(seamX - 8, HEIGHT);
  } else {
    ctx.moveTo(seamX - 36, 0);
    ctx.lineTo(seamX + 120, 0);
    ctx.lineTo(seamX + 8, HEIGHT);
    ctx.lineTo(seamX - 126, HEIGHT);
  }
  ctx.closePath();

  const fog = isLTR
    ? ctx.createLinearGradient(seamX - 120, 0, seamX + 126, 0)
    : ctx.createLinearGradient(seamX - 126, 0, seamX + 120, 0);

  if (isLTR) {
    fog.addColorStop(0.00, 'rgba(255,255,255,0.00)');
    fog.addColorStop(0.30, 'rgba(255,255,255,0.03)');
    fog.addColorStop(0.52, 'rgba(255,255,255,0.06)');
    fog.addColorStop(0.72, 'rgba(255,255,255,0.02)');
    fog.addColorStop(1.00, 'rgba(255,255,255,0.00)');
  } else {
    fog.addColorStop(0.00, 'rgba(255,255,255,0.00)');
    fog.addColorStop(0.28, 'rgba(255,255,255,0.02)');
    fog.addColorStop(0.48, 'rgba(255,255,255,0.06)');
    fog.addColorStop(0.70, 'rgba(255,255,255,0.03)');
    fog.addColorStop(1.00, 'rgba(255,255,255,0.00)');
  }

  ctx.fillStyle = fog;
  ctx.fill();
  ctx.restore();
}

async function renderMiq({ avatarUrl, displayName, username, userId, text, type }) {
  const theme = getTheme(type);
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');

  // 背景
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const avatarPanelW = Math.round(WIDTH * 0.47);
  const textPanelW = WIDTH - avatarPanelW;

  let avatarX = 0;
  let textX = avatarPanelW;
  let seamDirection = 'left-to-right';

  if (theme.avatarOnRight) {
    avatarX = WIDTH - avatarPanelW;
    textX = 0;
    seamDirection = 'right-to-left';
  }

  await drawAvatarPanel(ctx, avatarUrl, avatarX, 0, avatarPanelW, HEIGHT);

  // 白系テーマ時は右側背景を明示
  if (type === 'white' || type === 'reverseWhite') {
    ctx.fillStyle = '#f6efe5';
    ctx.fillRect(textX, 0, textPanelW, HEIGHT);
  } else {
    ctx.fillStyle = '#000000';
    ctx.fillRect(textX, 0, textPanelW, HEIGHT);
  }

  // 斜め境界
  const seamX = theme.avatarOnRight ? avatarX : avatarPanelW;
  drawDiagonalSeam(ctx, seamX, seamDirection);

  // テキスト中心
  const centerX = textX + textPanelW * 0.53;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // 本文
  const quoteMaxWidth = Math.min(420, textPanelW - 110);
  const quoteMaxHeight = 180;
  const safeText = text && text.trim() ? text.trim() : ' ';
  const quoteLayout = fitTextLines(
    ctx,
    safeText,
    quoteMaxWidth,
    quoteMaxHeight,
    58,
    32,
    3,
    700
  );

  ctx.fillStyle = theme.text;
  ctx.font = `700 ${quoteLayout.fontSize}px "Noto Sans CJK JP Bold"`;

  const totalTextHeight = quoteLayout.lines.length * quoteLayout.lineHeight;
  const quoteBaseY = 305 - totalTextHeight / 2 + quoteLayout.lineHeight / 2;

  quoteLayout.lines.forEach((line, index) => {
    ctx.fillText(line, centerX, quoteBaseY + index * quoteLayout.lineHeight, quoteMaxWidth + 20);
  });

  // displayName
  const nameMaxWidth = Math.min(420, textPanelW - 110);
  const nameLayout = fitTextLines(
    ctx,
    displayName || username,
    nameMaxWidth,
    48,
    28,
    22,
    1,
    700
  );

  ctx.fillStyle = theme.text;
  ctx.font = `700 ${nameLayout.fontSize}px "Noto Sans CJK JP Bold"`;

  const nameTotalHeight = nameLayout.lines.length * nameLayout.lineHeight;
  const nameBaseY = 430 - nameTotalHeight / 2 + nameLayout.lineHeight / 2;

  nameLayout.lines.forEach((line, index) => {
    ctx.fillText(line, centerX, nameBaseY + index * nameLayout.lineHeight, nameMaxWidth + 20);
  });

  // @username
  ctx.font = `500 24px "Noto Sans CJK JP"`;
  ctx.fillStyle = theme.subtext;
  ctx.fillText(`@${username}`, centerX, 468);

  // ID
  ctx.font = `500 17px "Noto Sans CJK JP"`;
  ctx.fillStyle = theme.subtext;
  ctx.fillText(String(userId), centerX, 503);

  // クレジット
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `500 12px "Noto Sans CJK JP"`;
  ctx.fillStyle =
    type === 'white' || type === 'reverseWhite'
      ? 'rgba(23,23,23,0.28)'
      : 'rgba(255,255,255,0.28)';
  ctx.fillText('Blueberry Health BOT', WIDTH - 24, HEIGHT - 12);

  return canvas.encode('png');
}

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (!['miq', 'goroku'].includes(interaction.commandName)) return;

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
