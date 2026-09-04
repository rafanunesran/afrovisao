# AfroVisão — câmera do celular direto para o Google Drive

Site-aplicativo que abre a câmera do celular, tira fotos e envia cada uma para
uma pasta do Google Drive **da professora ou professor**. Os alunos não precisam
de conta Google, não instalam nada e **não digitam senha nenhuma**: abrem o link
e fotografam.

- Funciona no navegador do celular (Android e iPhone) e pode ser adicionado à tela de início.
- As fotos ficam guardadas no aparelho até serem enviadas — se a internet cair, nada se perde.
- Cada arquivo chega ao Drive como `TURMA_NOME_data_hora.jpg`, dentro de uma subpasta por turma.

## Como funciona

```
Celular do aluno                Google Apps Script          Google Drive
┌──────────────┐   foto em      ┌──────────────────┐  roda   ┌──────────────┐
│  site (HTML) │ ─── JSON ────► │ recebedor (.gs)  │ ─ com ──► │ sua pasta    │
│  câmera      │   pela internet│                  │ sua conta │ de fotos     │
└──────────────┘                └──────────────────┘          └──────────────┘
```

O site é só HTML, CSS e JavaScript (sem servidor, sem instalação). Quem grava no
Drive é um script do Google publicado por você, que roda com a sua conta. Por isso
as fotos caem na **sua** pasta, e nenhuma senha da sua conta fica dentro do site.

Para encerrar a atividade, **desative a implantação**: *Implantar → Gerenciar
implantações → ✏️ → Desativar*. A partir daí nenhum envio passa.

---

## Parte 1 — Criar a pasta e o recebedor no Google (10 minutos)

1. **Crie a pasta no Drive.** Ex.: `Fotos AfroVisão 2026`. Abra a pasta e copie o
   ID que aparece no endereço do navegador:
   `https://drive.google.com/drive/folders/`**`1AbCdEf...`** ← esse trecho é o ID.

2. **Crie o script.** Vá a [script.google.com](https://script.google.com) → *Novo projeto*.
   Apague o conteúdo do arquivo `Código.gs` e cole todo o conteúdo de
   [`apps-script/Codigo.gs`](apps-script/Codigo.gs) deste repositório.
   **Salve** (ícone de disquete ou Ctrl+S) — o Google publica a última versão
   *salva*, não a que está na tela.

3. **Confira a configuração** no topo do script:
   - `ID_DA_PASTA`: o ID copiado no passo 1 (já vem preenchido com a pasta "Afrovisao").
   - `CRIAR_SUBPASTA_POR_TURMA`: deixe `true` para separar as fotos por turma.
   - `TAMANHO_MAXIMO_MB` e `ID_DA_PLANILHA` (opcional): pode deixar como estão.

4. **Teste.** No editor, escolha a função `conferirConfiguracao` e clique em
   *Executar*. O Google vai pedir autorização — aceite (na tela "app não
   verificado", use *Avançado → Acessar projeto sem título*; é o seu próprio
   script). O registro deve mostrar `Pasta de destino: Afrovisao`.

5. **Publique.** *Implantar → Nova implantação → tipo: Aplicativo da Web*:
   - **Executar como:** Eu (sua conta).
   - **Quem pode acessar:** **Qualquer pessoa** ← precisa ser este, senão o
     celular do aluno é bloqueado.
   - Clique em *Implantar* e **copie a URL** terminada em `/exec`.

6. **Ponha a URL no site**: cole em `ENDPOINT`, dentro de
   [`js/config.js`](js/config.js).

> Ao alterar o script depois, salve e use *Implantar → Gerenciar implantações →
> ✏️ → Versão: **Nova versão***: a URL continua a mesma. Se usar *Nova
> implantação*, o Google gera **outra URL** — nesse caso atualize o `ENDPOINT`.

**Como conferir se deu certo:** abra a URL `/exec` no navegador:

```json
{"ok":true, "pasta":"Afrovisao", "total":0, "versao":3}
```

- `pasta` começando com `ERRO:` → o `ID_DA_PASTA` está errado.
- `versao` menor que 3 (ou ausente) → a implantação ainda serve um código antigo:
  salve o arquivo e publique uma nova versão.

O mesmo diagnóstico aparece no aplicativo, na engrenagem ⚙ → **Avançado**.

---

## Parte 2 — Colocar o site no ar (GitHub Pages, grátis)

1. Neste repositório, vá em **Settings → Pages**.
2. Em *Build and deployment*, escolha **Deploy from a branch**, selecione a branch
   com este código, pasta `/ (root)` e salve.
3. Em um ou dois minutos o site fica disponível em
   `https://rafanunesran.github.io/afrovisao/`.

A câmera do navegador **só funciona em endereços `https://`** — o GitHub Pages já
atende a isso.

---

## Parte 3 — Usando na aula

1. O aluno abre o link do site (um QR Code do endereço ajuda muito).
2. Digita **nome** e **turma** — fica guardado no aparelho, é digitado só uma vez.
3. Toca no círculo para fotografar; o ⇆ troca entre câmera traseira e frontal.
4. O número no canto mostra quantas fotos estão na fila. Tocando nele aparecem
   as miniaturas, onde dá para apagar as ruins.
5. **Enviar para o Drive** manda tudo. Cada foto fica marcada como *Enviada ✓*
   ou *Falhou* (nesse caso, é só tocar em enviar de novo quando a internet voltar).

Se um celular ficar com uma versão antiga do site (tela travada, erro estranho),
use a engrenagem ⚙ → **Atualizar o aplicativo**: apaga a cópia guardada no
aparelho e recarrega.

Dica: no Android (Chrome) use *menu → Adicionar à tela inicial*; no iPhone (Safari),
*compartilhar → Adicionar à Tela de Início*. O app abre em tela cheia, sem barra
de endereço.

---

## Testar no computador antes da aula

```bash
python3 -m http.server 8000
```

Abra `http://localhost:8000` — a câmera funciona em `localhost` mesmo sem https.

---

## Se algo der errado

| O que aparece | Provável causa | Como resolver |
|---|---|---|
| "O script publicado está numa versão antiga" | O arquivo não foi salvo, ou faltou publicar nova versão | Salve no editor e publique *Nova versão*; se a URL mudou, atualize o `ENDPOINT` |
| "A permissão da câmera foi negada" | O navegador bloqueou o acesso | Cadeado ao lado do endereço → permitir Câmera → recarregar |
| "A câmera só funciona em endereços seguros" | O site foi aberto por `http://` | Use o link `https://` do GitHub Pages |
| "Resposta inesperada do Google" | A implantação não está como *Qualquer pessoa* | Refaça o passo 5 da Parte 1 |
| "Invalid file or folder ID" | `ID_DA_PASTA` errado | Passo 3 da Parte 1, depois publique nova versão |
| "Sem conexão com a internet…" | Wi-Fi fora, ou `ENDPOINT` errado | Confira a rede e a URL na engrenagem ⚙ → Avançado |
| "Este aparelho está com uma versão antiga do site" | O celular guardou uma cópia velha | Engrenagem ⚙ → **Atualizar o aplicativo** |
| Envio falha só com fotos grandes | Cota do Apps Script | Escolha qualidade "Leve (1200 px)" na engrenagem |

Para ver o que o script recebeu: no editor do Apps Script, menu lateral →
**Execuções**.

---

## Cuidados com as fotos dos alunos

- Fotografias de estudantes são dados pessoais: peça a autorização de uso de
  imagem que a escola já utiliza antes da atividade.
- Mantenha a pasta do Drive **restrita** (não use "qualquer pessoa com o link").
- Como não há senha, **enquanto a implantação estiver ativa** qualquer pessoa com
  o endereço do site consegue enviar fotos para a pasta. Ao terminar o projeto,
  desative a implantação: *Implantar → Gerenciar implantações → ✏️ → Desativar*.

## Estrutura dos arquivos

```
index.html               aplicativo dos alunos
css/estilo.css           aparência (feita para celular)
js/config.js             ← endereço do Apps Script
js/banco.js              fila de fotos no aparelho (IndexedDB)
js/app.js                câmera, captura, fila e envio
js/atualizar.js          botão que apaga a cópia guardada no aparelho
sw.js                    permite abrir o app sem internet
manifest.webmanifest     ícone e nome ao instalar na tela inicial
apps-script/Codigo.gs    ← código que você cola no script.google.com
```
