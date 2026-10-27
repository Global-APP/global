# Painel de reação: carregamento e confirmação — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer o painel mostrar carregamento enquanto instala as reações e confirmar alterações feitas exclusivamente por seu autor.

**Architecture:** Associar o ID do autor ao painel ativo no documento Guild. O publicador envia um embed de carregamento, instala as reações e só então persiste o painel e exibe os valores atuais; o serviço de reações valida autor/permissão, aplica a ação, remove a reação do usuário e confirma no embed.

**Tech Stack:** Node.js, `@fluxerjs/core` EmbedBuilder/events, Mongoose, `node:test`.

**Spec:** `docs/superpowers/specs/2026-10-26-painel-reacao-feedback-design.md`.

## Global Constraints

- O modo persistido para registros antigos continua `cru`; sua apresentação passa a ser **Normal**.
- Somente o autor do painel ativo pode alterá-lo, após cumprir a mesma permissão exigida por `config`.
- A reação de sucesso remove apenas a reação daquele usuário e nunca limpa as reações de outras pessoas.
- O embed final só substitui “Carregando…” após todas as reações serem instaladas.
- Nenhuma menção automática é permitida no painel.

## Review Focus

- Usuário diferente do autor do painel não altera estado nem tem sua reação removida.
- Autor que perdeu Gerenciar Canais e não é desenvolvedor autorizado não altera estado.
- Falha em qualquer reação inicial não grava painel/autor como ativos.
- Falha ao remover reação ou editar o painel após persistir não desfaz a configuração.
- Nome exibido Normal não altera valor salvo nem compatibilidade com registros antigos.

---

### Task 1: Publish loading embed and acknowledge the panel author's reactions

**Files:**
- Modify: `src/models/Guild.js`
- Modify: `src/services/configPainel.js`
- Modify: `src/commands/conexao/config.js`
- Modify: `src/events/index.js` only if diagnostics or payload routing need adjustment
- Test: `tests/configPainel.test.js`

**Interfaces:**
- Add `configPainelUserId` (string, default `null`) to Guild.
- `textoPainel(config, feedback?)` displays the mode as **Normal** for missing/`cru`, and optionally a success confirmation.
- Add an embed builder for loading and ready panel states using current config.
- `publicarPainelConfiguracao(message, guildId)` records both the panel message ID and `message.author.id` only after reaction setup succeeds.
- `tratarReacaoPainel(payload)` accepts a reaction only when its user ID matches `configPainelUserId` and that user is a developer or passes `membroPodeGerenciarCanais`; after a successful action it removes that user's emoji with `message.removeReaction(emoji, userId)` and edits the embed with state plus success feedback.

- [ ] Add tests that the initial send is an embed with “Carregando…”, reaction installation precedes the final ready embed, and the mode label is Normal for absent/`cru` values.
- [ ] Add tests that the command author can change a setting, their reaction is removed, and the resulting embed confirms success.
- [ ] Add tests that a different manager, or the panel author without required permission, cannot change settings; assert no reaction removal or success edit.
- [ ] Add failure tests confirming reaction installation failure does not persist active panel ID/author and a post-save remove/edit failure does not roll back saved config.
- [ ] Run `node --test tests/configPainel.test.js` and verify the new behavior fails before implementation.
- [ ] Implement the schema, loading/ready embed flow, author-bound permission check, reaction removal, and confirmation; log handler rejection/failure reason sufficiently to diagnose an ignored reaction.
- [ ] Run `node --test tests/configPainel.test.js`, then full `node --test`, `npm run lint`, `npm run typecheck`, and `git diff --check`.
- [ ] Commit the implementation and tests.
