# Painel de reação: carregamento e confirmação

## Objetivo

Tornar claro que o painel de `PREFIXO + config` está pronto e que uma reação foi processada, restringindo as ações à pessoa que abriu aquele painel.

## Comportamento aprovado

- Publicar o painel como embed com “Carregando…” enquanto as cinco reações são adicionadas.
- Somente depois de todas as reações serem adicionadas, editar o mesmo embed para mostrar os valores atuais e as instruções.
- O modo persistido continua `cru` por compatibilidade, mas o nome mostrado às pessoas passa a ser **Normal**; `embed` continua **Embed**.
- Somente o usuário que executou `PREFIXO + config` pode usar as reações daquele painel, e ele deve continuar satisfazendo o acesso do comando: desenvolvedor autorizado ou permissão Gerenciar Canais/Administrador.
- Após uma reação válida desse usuário, remover somente a reação dele e editar o embed para exibir o estado atualizado e uma confirmação de sucesso.
- Reações de outras pessoas não alteram a configuração.
- O identificador do autor fica associado ao painel ativo por servidor, e a abertura de um painel novo substitui também o autor ativo.
- Falhas ao adicionar reações continuam reportadas sem sucesso falso e não deixam aquele painel ativo.

## Fora do escopo

- Alterar o modo padrão, que continua sendo `cru`.
- Alterar requisitos de acesso ao próprio comando `config`.
- Corrigir o aviso geral de depreciação do Mongoose observado nos logs; não é necessário para este fluxo.
