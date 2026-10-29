function resolverAlvoReply(copiaDestino, referenciaOriginal) {
  if (copiaDestino && copiaDestino.msgId && copiaDestino.canalId) {
    return {
      messageId: String(copiaDestino.msgId),
      channelId: String(copiaDestino.canalId),
      guildId: String(copiaDestino.guildId)
    };
  }

  if (!referenciaOriginal || !referenciaOriginal.messageId || !referenciaOriginal.channelId) return null;
  return {
    messageId: String(referenciaOriginal.messageId),
    channelId: String(referenciaOriginal.channelId),
    ...(referenciaOriginal.guildId ? { guildId: String(referenciaOriginal.guildId) } : {})
  };
}

function idMensagemParcial(erro) {
  const id = erro && (
    erro.messageId
    || (erro.message && typeof erro.message === 'object' && erro.message.id)
    || (erro.data && erro.data.id)
    || (erro.response && erro.response.data && erro.response.data.id)
  );
  return id ? String(id) : null;
}

/**
 * @param {any} webhook
 * @param {any} payload
 * @param {(erro: any, mensagemParcialId: string | null) => void | Promise<void>} [aoFalharReply]
 * @returns {Promise<{mensagem: any, comReply: boolean}>}
 */
async function enviarComReplyOuFallback(webhook, payload, aoFalharReply = () => {}) {
  if (!payload.replyTo) {
    return { mensagem: await webhook.send(payload, true), comReply: false };
  }

  try {
    return { mensagem: await webhook.send(payload, true), comReply: true };
  } catch (erroReply) {
    const mensagemParcialId = idMensagemParcial(erroReply);
    if (mensagemParcialId && typeof webhook.deleteMessage === 'function') {
      try {
        await webhook.deleteMessage(mensagemParcialId);
      } catch (_) {
        // O reenvio sem reply ainda pode recuperar a mensagem para o destino.
      }
    }

    await aoFalharReply(erroReply, mensagemParcialId);
    const payloadSemReply = { ...payload };
    delete payloadSemReply.replyTo;
    delete payloadSemReply.ping;
    return { mensagem: await webhook.send(payloadSemReply, true), comReply: false };
  }
}

module.exports = { resolverAlvoReply, enviarComReplyOuFallback };
