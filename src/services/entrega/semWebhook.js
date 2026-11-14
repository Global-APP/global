class ErroSemWebhook extends Error {
  constructor(destino) {
    super(`Sem webhook disponível no canal ${destino.canalId} do servidor ${destino.guildId}`);
    this.name = 'ErroSemWebhook';
    this.destino = destino;
  }
}

module.exports = { ErroSemWebhook };
