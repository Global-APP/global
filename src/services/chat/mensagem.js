const { EmbedBuilder } = require('@fluxerjs/core');
const { client } = require('../../lib/client');
const { DONO_ID, MUBI_ID, COR_EMBED_MUBI } = require('../../config');
const Guild = require('../../models/Guild');
const User = require('../../models/User');
const { corDaBadge } = require('../badges');

async function infoMensagem(message) {
  const autor = message.author;
  const guildId = String(message.guildId || (message.guild ? message.guild.id : '0'));
  const g = message.guild || client.guilds.get(guildId);
  const nomeServidor = g && g.name ? g.name : 'Servidor Desconhecido';

  const nickname = autor.displayName || autor.username;
  const username = autor.username;

  const [guildConfig, usuario] = await Promise.all([
    Guild.findOne({ guildId }).lean(),
    User.findOne({ userId: String(autor.id) }).select('staff badges selectedBadge').lean()
  ]);
  const ehStaff = !!(usuario && usuario.staff);

  let authorText = `${nickname} (@${username}#${autor.discriminator})`;
  const corGuild = guildConfig && guildConfig.cor != null ? guildConfig.cor : 0x0B0B0B;
  let corEmbed = corDaBadge(usuario) ?? corGuild;

  if (autor.id === DONO_ID) {
    authorText = `${nickname} (@${username}#${autor.discriminator}) - Desenvolvedor do Global`;
    corEmbed = 0xC0B29D;
  } else if (autor.id === MUBI_ID) {
    authorText = `${nickname} (@${username}#${autor.discriminator}) - Desenvolvedor do Global`;
    corEmbed = COR_EMBED_MUBI;
  } else if (ehStaff) {
    authorText = `${nickname} (@${username}#${autor.discriminator}) - Staff`;
  }

  let urlMidia = null;
  if (message.attachments && message.attachments.size > 0) {
    urlMidia = message.attachments.first().url;
  }
  if (!urlMidia) {
    const figurinhas = message.stickers;
    const figurinha = Array.isArray(figurinhas) ? figurinhas[0] : (figurinhas && figurinhas.first ? figurinhas.first() : null);
    if (figurinha && figurinha.url && !/\.json(\?|$)/i.test(figurinha.url)) {
      urlMidia = figurinha.url;
    }
  }

  return { guildId, nomeServidor, authorText, corEmbed, urlMidia };
}

function montarEmbedGlobal(message, info) {
  const autor = message.author;
  const avatarUrl = autor.displayAvatarURL ? autor.displayAvatarURL() : null;
  const embed = new EmbedBuilder()
    .setDescription(message.content ? message.content : null)
    .setColor(info.corEmbed)
    .setAuthor({ name: info.authorText, iconURL: avatarUrl, url: `https://web.fluxer.app/users/${autor.id}` })
    .setFooter({ text: info.nomeServidor });
  if (info.urlMidia) embed.setImage(info.urlMidia);
  return embed;
}

module.exports = { infoMensagem, montarEmbedGlobal };
