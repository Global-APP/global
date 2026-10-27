<div align="center">

<img src=".github/assets/global-icon.png" alt="Global" width="120" height="120">

<h1>Global</h1>

</div>

Um chat global entre comunidades do [Fluxer](https://fluxer.app). Cada servidor escolhe um canal, e as mensagens dele são retransmitidas para os canais globais dos outros servidores, com edição, exclusão e replies sincronizados.

[![Node.js](https://img.shields.io/badge/Node.js-20%2B-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org)
[![MongoDB](https://img.shields.io/badge/MongoDB-47A248?logo=mongodb&logoColor=white)](https://www.mongodb.com)
[![Fluxer](https://img.shields.io/badge/Fluxer-adicionar%20ao%20servidor-eb0075)](https://web.fluxer.app/oauth2/authorize?client_id=1562253521942745089&scope=bot&permissions=22527189434367169)
[![License](https://img.shields.io/badge/license-PolyForm--Noncommercial--1.0.0-blue)](LICENSE)

## Instalação

Requer Node.js 20+ ou Bun, um MongoDB em execução e um token de bot do Fluxer.

```sh
git clone https://github.com/Global-APP/global
cd global
bun install
```

## Configuração

```sh
cp .env.example .env
```

| Variável       | Obrigatória | Padrão                             |
| -------------- | ----------- | ---------------------------------- |
| `TOKEN`        | Sim         | nenhum                             |
| `PREFIXO`      | Não         | `g.`                               |
| `MONGODB_URI`  | Não         | `mongodb://127.0.0.1:27017/global` |
| `NSFW_ENABLED` | Não         | `true`                              |
| `NSFW_URL`     | Não         | `http://localhost:3000`            |
| `NSFW_API_KEY` | Não         | vazio                              |

> [!NOTE]
> Caso deseja usar o serviço para filtragem de mídias NSFW, o mesmo fica localizado em: https://huggingface.co/AdamCodd/vit-base-nsfw-detector

> [!NOTE]
> Defina `NSFW_ENABLED=false` para desativar a checagem e não precisar de `NSFW_URL`; nesse modo, imagens e vídeos não passam pelo filtro NSFW. Se habilitado, mantenha o serviço no endereço configurado em `NSFW_URL`.

## Execução

```sh
bun index.js
```

Com Node.js, passe o arquivo de ambiente explicitamente:

```sh
node --env-file=.env index.js
```
