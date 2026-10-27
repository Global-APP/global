# Modo debug do console — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar `--debug` para mostrar diagnóstico detalhado do bot e de chamadas REST sem alterar os logs normais nem expor parâmetros sensíveis.

**Architecture:** Detectar a flag uma vez na configuração de inicialização e adicionar `log.debug` gated pelo modo. Adaptar a instância REST do Fluxer com wrappers idempotentes para registrar método/rota sanitizada, duração, resultado e allowlist de rate-limit headers; usar o mesmo nível DEBUG para os detalhes extras de eventos e decisões do painel.

**Tech Stack:** Node.js/Bun, `@fluxerjs/core`/`@fluxerjs/rest`, Mongoose, `node:test`.

**Spec:** `docs/superpowers/specs/2026-10-27-debug-console-design.md`.

## Global Constraints

- Sem `--debug`, os logs existentes permanecem com o comportamento e volume atuais.
- Logs de debug nunca incluem token de autenticação, token de webhook, corpo da requisição/resposta, conteúdo de mensagem ou query string.
- Linhas DEBUG vão ao console e ao arquivo diário existente.
- Os cabeçalhos de rate limit seguem a allowlist exata do spec.
- Wrappers de instrumentação são instalados no máximo uma vez por instância REST.
- Erros existentes continuam visíveis no modo normal; debug apenas acrescenta detalhes.

## Review Focus

- `--debug` em qualquer posição dos argumentos ativa debug; argumentos de comandos do chat não ativam debug.
- Múltiplos métodos REST, inclusive erro lançado, são registrados sem alterar valor retornado/comportamento/retry.
- Rotas de webhook e URLs com query não revelam tokens/segredos.
- Resposta 429 registra `Retry-After` e cabeçalhos disponíveis sem registrar body.
- Execuções sem flag não emitem linhas DEBUG nem logs HTTP adicionais.

---

### Task 1: Flag de inicialização e nível DEBUG

**Files:**
- Modify: `src/config.js`
- Modify: `src/util/logger.js`
- Test: `tests/debug.test.js`

**Interfaces:**
- `DEBUG_MODE` é `process.argv.includes('--debug')` e é exportado pela configuração.
- `log.debug(tag, message, detail?)` escreve console/arquivo somente quando `DEBUG_MODE` está ativo; inclui timestamp e nível `DEBUG`.

- [ ] Testar a leitura de `--debug` presente/ausente e `log.debug` ligado/desligado.
- [ ] Verificar falha RED antes da implementação.
- [ ] Implementar flag e nível DEBUG preservando métodos/saídas existentes.
- [ ] Rodar os testes focados e confirmar que sem flag não há saída debug.
- [ ] Commitar Task 1.

### Task 2: Diagnóstico seguro das chamadas REST

**Files:**
- Create: `src/util/debugRest.js`
- Modify: `src/lib/client.js`
- Test: `tests/debugRest.test.js`

**Interfaces:**
- `instalarDebugRest(rest, logger, enabled)` é idempotente e não modifica a REST quando `enabled` é falso.
- Registra método, rota sem query/userinfo, snowflakes normalizados, token de webhook mascarado, duração e resultado; status/código são registrados quando disponíveis.
- Intercepta `rateLimiter.updateFromHeaders` e imprime somente a allowlist de rate-limit headers declarada no spec.

- [ ] Testar chamadas com sucesso, erros 401/403/429 e cabeçalhos de rate limit.
- [ ] Testar que Authorization, tokens de webhook, query strings e corpos não aparecem nos logs.
- [ ] Testar que wrappers mantêm retorno e erro originais e não são duplicados após instalação repetida.
- [ ] Confirmar RED antes da implementação.
- [ ] Implementar o adaptador e instalá-lo na instância REST do client apenas em debug.
- [ ] Rodar os testes focados e confirmar ausência de instrumentação quando desativado.
- [ ] Commitar Task 2.

### Task 3: Diagnóstico de eventos e painel

**Files:**
- Modify: `src/events/index.js`
- Modify: `src/services/configPainel.js`
- Test: `tests/configPainel.test.js`

**Interfaces:**
- Eventos de reação usam `log.debug` para registrar payload de identificação sanitizado (guild/canal/mensagem/autor/emoji) antes de delegar.
- Rejeições esperadas (emoji desconhecido, painel antigo, autor diferente, permissão insuficiente ou contexto inválido) ficam em DEBUG; falhas inesperadas continuam em ERROR/WARN conforme o comportamento atual.

- [ ] Testar entrada de eventos single/batch e principais causas de rejeição em DEBUG.
- [ ] Testar que essas linhas não aparecem sem `--debug` e que erros reais continuam registrados.
- [ ] Implementar migração dos logs diagnósticos já adicionados para `log.debug` sem remover a normalização de emoji.
- [ ] Rodar `node --test`, `npm run lint`, `npm run typecheck` e `git diff --check`.
- [ ] Commitar Task 3.
