# Modo debug do console

## Objetivo

Facilitar o diagnóstico do bot em execução, incluindo falhas de API e eventos de reação, sem aumentar o volume normal de logs nem expor dados sensíveis.

## Comportamento aprovado

- O modo é ativado somente quando o processo recebe `--debug` nos argumentos de inicialização.
- Sem `--debug`, os logs existentes permanecem com o comportamento e volume atuais.
- Com `--debug`, o logger oferece nível DEBUG e mostra detalhes adicionais de inicialização, eventos do painel e decisões de processamento/rejeição.
- Com `--debug`, chamadas REST registram método, rota sanitizada, duração e resultado; falhas incluem status/código/motivo quando disponíveis. Sucessos sem status acessível registram resultado concluído.
- Cabeçalhos úteis de rate limit são exibidos em allowlist: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, `X-RateLimit-Reset-After`, `X-RateLimit-Bucket` e `Retry-After`; erros 401/403/429 incluem os dados de erro disponíveis.
- Logs de debug nunca incluem token de autenticação, token de webhook, corpo da requisição/resposta, conteúdo de mensagem ou query string.
- As linhas DEBUG são enviadas ao console e ao arquivo diário de log já usado pelo logger.
- Erros e logs atuais não são silenciados por `--debug`; debug apenas acrescenta informação.

## Decisões de implementação

- A flag é lida de `process.argv`, sem dependência adicional e sem alteração no parser de comandos do chat.
- O adaptador REST usa wrappers idempotentes na instância interna já usada por `@fluxerjs/core`; rotas e cabeçalhos são sanitizados/allowlisted antes de escrever no console ou arquivo.
- A sanitização remove query e userinfo, mascara token em rotas de webhook e normaliza snowflakes para `:id`; o host só é incluído para URLs externas.
- Novos detalhes de eventos de reação usam `log.debug`, não INFO/WARN, para não mudar a saída sem a flag.

## Fora do escopo

- Alterar políticas de retry, timeouts ou rate limiting.
- Registrar payloads/corpos HTTP ou conteúdo de mensagens.
- Criar dashboards, métricas externas ou coleta remota de logs.
