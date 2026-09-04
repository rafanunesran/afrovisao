# AfroVisão — câmera do celular direto para o Google Drive

Site-aplicativo que abre a câmera do celular, tira fotos e envia cada uma para
uma pasta do Google Drive **da professora ou professor**. Os alunos não precisam
de conta Google, não instalam nada e **não digitam senha nenhuma**: basta abrir
o link enquanto a atividade estiver liberada.

Quem abre e fecha a atividade é você, pela **página de administração**. Com a
atividade bloqueada, o aplicativo dos alunos nem abre a câmera.

- Funciona no navegador do celular (Android e iPhone) e pode ser adicionado à tela de início.
- As fotos ficam guardadas no aparelho até serem enviadas — se a internet cair, nada se perde.
- Cada arquivo chega ao Drive como `TURMA_NOME_data_hora.jpg`, dentro de uma subpasta por turma.

## Como funciona

```
Celular do aluno                Google Apps Script              Google Drive
┌──────────────┐   foto em      ┌──────────────────┐  roda com  ┌──────────────┐
│  site (HTML) │ ─── JSON ────► │ recebedor (.gs)  │ ─ sua ───► │ sua pasta    │
│  câmera      │                │ liberado?  ──────┼─ não ─┐    │ de fotos     │
└──────────────┘                └────────▲─────────┘       │    └──────────────┘
       ▲                                 │ liberar/bloquear │
       └── "atividade bloqueada" ◄────────┼─────────────────┘
                                 ┌────────┴─────────┐
                                 │ admin.html       │  ← só você, com a
                                 │ (seu celular)    │    senha de administrador
                                 └──────────────────┘
```

O site é só HTML, CSS e JavaScript (sem servidor, sem instalação). Quem grava no
Drive é um script do Google publicado por você, que roda com a sua conta. Por isso
as fotos caem na **sua** pasta, e nenhuma senha da sua conta fica dentro do site.

---

## Parte 1 — Criar a pasta e o recebedor no Google (10 minutos)

1. **Crie a pasta no Drive.** Ex.: `Fotos AfroVisão 2026`. Abra a pasta e copie o
   ID que aparece no endereço do navegador:
   `https://drive.google.com/drive/folders/`**`1AbCdEf...`** ← esse trecho é o ID.

2. **Crie o script.** Vá a [script.google.com](https://script.google.com) → *Novo projeto*.
   Apague o conteúdo do arquivo `Código.gs` e cole todo o conteúdo de
   [`apps-script/Codigo.gs`](apps-script/Codigo.gs) deste repositório.

3. **Preencha a configuração** no topo do script:
   - `ID_DA_PASTA`: o ID copiado no passo 1 (neste repositório já vem preenchido
     com a pasta "Afrovisao").
   - `SENHA_ADM`: a senha que abre a página de administração. Neste repositório
     ela já vem preenchida. Vale o que estiver escrito nessa linha.
   - `LIBERADO_DE_INICIO`: deixe `false` — a atividade começa bloqueada.
   - `CRIAR_SUBPASTA_POR_TURMA`: deixe `true` para separar as fotos por turma.
   - `ID_DA_PLANILHA` (opcional): ID de uma planilha para registrar cada envio.

   Alternativa: se você apagar o valor e deixar o texto do modelo, o script
   procura a senha na propriedade `senhaAdm` (*Configurações do projeto →
   Propriedades do script*), que sobrevive a colagens futuras deste arquivo.
   O valor escrito no código sempre tem prioridade.

4. **Teste a configuração.** No editor, escolha a função `conferirConfiguracao`
   e clique em *Executar*. O Google vai pedir autorização — aceite (na tela
   "app não verificado", use *Avançado → Acessar projeto sem título*; é o seu
   próprio script). O registro deve mostrar o nome da pasta.

5. **Publique.** *Implantar → Nova implantação → tipo: Aplicativo da Web*:
   - **Executar como:** Eu (sua conta).
   - **Quem pode acessar:** **Qualquer pessoa** ← precisa ser este, senão o
     celular do aluno é bloqueado.
   - Clique em *Implantar* e **copie a URL** terminada em `/exec`.

> Sempre que alterar o script, use *Implantar → Gerenciar implantações → editar (✏️)
> → Versão: **Nova versão***. Assim a URL continua a mesma. Sem isso, a URL
> continua servindo o código antigo — é o tropeço mais comum deste projeto.

**Como conferir se deu certo:** abra a URL `/exec` no navegador. A resposta mostra
tudo o que importa, sem revelar a senha:

```json
{"ok":true, "aberto":false, "senhaDefinida":true, "pasta":"Afrovisao", "versao":2}
```

- `senhaDefinida: false` → a senha não chegou ao ar (falta publicar nova versão).
- `pasta` começando com `ERRO:` → o `ID_DA_PASTA` está errado.
- sem o campo `versao` → a implantação ainda serve um código antigo.

---

## Parte 2 — Colocar o site no ar (GitHub Pages, grátis)

1. Neste repositório, vá em **Settings → Pages**.
2. Em *Build and deployment*, escolha **Deploy from a branch**, selecione a branch
   com este código, pasta `/ (root)` e salve.
3. Em um ou dois minutos o site fica disponível em
   `https://rafanunesran.github.io/afrovisao/`.

A câmera do navegador **só funciona em endereços `https://`** — o GitHub Pages já
atende a isso.

Em [`js/config.js`](js/config.js) fica apenas o endereço do script:

```js
window.APP_CONFIG = {
  NOME_APP: 'AfroVisão',
  ENDPOINT: 'https://script.google.com/macros/s/AKfy.../exec',  // URL do passo 5
  LARGURA_MAXIMA: 1600,
  QUALIDADE_JPEG: 0.85
};
```

---

## Parte 3 — Usando na aula

### Você, antes de começar

Abra `https://rafanunesran.github.io/afrovisao/admin.html` (o link também está na
engrenagem ⚙ do aplicativo), digite a sua `SENHA_ADM` e escolha:

- **50 minutos** ou **1h40** — a atividade fecha sozinha ao fim do tempo, mesmo
  que você esqueça de bloquear.
- **Sem prazo** — fica aberta até você tocar em *Bloquear agora*.

O painel ainda mostra quantas fotos já chegaram, o horário da última, um link para
a pasta no Drive e um campo de **recado**, que aparece na tela dos alunos enquanto
a atividade estiver fechada (ex.: "Voltamos às 14h, na quadra").

Guarde esse endereço só com você. Vale marcar como favorito no seu celular.

### Os alunos

1. O aluno abre o link do site (um QR Code do endereço ajuda muito).
2. Digita **nome** e **turma** — fica guardado no aparelho, é digitado só uma vez.
3. Toca no círculo para fotografar; o ⇆ troca entre câmera traseira e frontal.
4. O número no canto mostra quantas fotos estão na fila. Tocando nele aparecem
   as miniaturas, onde dá para apagar as ruins.
5. **Enviar para o Drive** manda tudo. Cada foto fica marcada como *Enviada ✓*
   ou *Falhou* (nesse caso, é só tocar em enviar de novo).

Se você bloquear no meio da aula, o app dos alunos cai na tela de cadeado em até
um minuto e a câmera se fecha. As fotos que ainda não subiram **continuam
guardadas no aparelho** e podem ser enviadas quando você liberar de novo.

O endereço do script fica apenas em `js/config.js` — o aluno não vê nem digita
nada disso. Se um celular ficar com uma versão antiga do site (tela travada,
erro estranho), use a engrenagem ⚙ → **Atualizar o aplicativo**: isso apaga a
cópia guardada no aparelho e recarrega. O mesmo botão existe no painel.

Dica: no Android (Chrome) use *menu → Adicionar à tela inicial*; no iPhone (Safari),
*compartilhar → Adicionar à Tela de Início*. O app abre em tela cheia, sem barra
de endereço.

---

## Testar no computador antes da aula

```bash
python3 -m http.server 8000
```

Abra `http://localhost:8000` — a câmera funciona em `localhost` mesmo sem https.
Para testar no celular na mesma rede sem https, use o botão de reserva
("Tirar foto pelo aplicativo do celular"), que aparece quando a câmera é bloqueada.

---

## Se algo der errado

| O que aparece | Provável causa | Como resolver |
|---|---|---|
| "Atividade bloqueada" | A atividade não foi liberada, ou o prazo venceu | Abra `admin.html` e libere |
| "Senha de administrador incorreta" | Senha diferente da `SENHA_ADM` do script | Confira o valor no editor do Apps Script |
| "Falta definir a senha de administrador" | Nenhuma senha cadastrada | *Configurações do projeto → Propriedades do script → `senhaAdm`* (passo 3b) |
| "A permissão da câmera foi negada" | O navegador bloqueou o acesso | Cadeado ao lado do endereço → permitir Câmera → recarregar |
| "A câmera só funciona em endereços seguros" | O site foi aberto por `http://` | Use o link `https://` do GitHub Pages |
| "Resposta inesperada do Google" | A implantação não está como *Qualquer pessoa* | Refaça o passo 5 da Parte 1 |
| "Invalid file or folder ID" | O `ID_DA_PASTA` não foi preenchido | Passo 3 da Parte 1, depois publique nova versão |
| "Não foi possível falar com o servidor" | Sem internet, ou `ENDPOINT` errado | Confira o Wi-Fi e a URL em `js/config.js` |
| "O script publicado está numa versão antiga" | O código foi editado mas a implantação não | *Implantar → Gerenciar implantações → ✏️ → Nova versão* |
| "Este aparelho está com uma versão antiga do site" | O celular guardou uma cópia velha | Engrenagem ⚙ → **Atualizar o aplicativo** |
| Envio falha só com fotos grandes | Cota do Apps Script | Escolha qualidade "Leve (1200 px)" na engrenagem |

Para ver o que o script recebeu: no editor do Apps Script, menu lateral →
**Execuções**.

---

## Cuidados com as fotos dos alunos

- Fotografias de estudantes são dados pessoais: peça a autorização de uso de
  imagem que a escola já utiliza antes da atividade.
- Mantenha a pasta do Drive **restrita** (não use "qualquer pessoa com o link").
- Como os alunos não digitam senha, **enquanto a atividade estiver liberada**
  qualquer pessoa com o endereço do site consegue enviar fotos. Por isso a
  atividade começa bloqueada, prefira liberar com prazo (50 min / 1h40) e
  bloqueie ao fim da aula. Terminado o projeto, você pode desativar a implantação
  do Apps Script.
- A `SENHA_ADM` está escrita em `apps-script/Codigo.gs`, a pedido do professor,
  para simplificar a manutenção. Como o repositório é público, quem o encontrar
  pode abrir e fechar a atividade. Isso não dá acesso ao seu Drive nem às fotos
  já enviadas — o pior caso é alguém liberar a atividade fora de hora. Para
  fechar essa brecha depois, basta trocar o valor de `SENHA_ADM` por outro que
  não esteja no repositório (ou deixar a linha do modelo e usar a propriedade
  `senhaAdm`) e publicar uma nova versão.
- A senha **não** fica em `js/config.js` nem em nenhum arquivo servido aos alunos.

## Estrutura dos arquivos

```
index.html               aplicativo dos alunos
admin.html               painel para liberar e bloquear a atividade
css/estilo.css           aparência (feita para celular)
js/config.js             ← endereço do Apps Script (sem senha)
js/atualizar.js          botão que apaga a cópia guardada no aparelho
js/banco.js              fila de fotos no aparelho (IndexedDB)
js/app.js                câmera, captura, fila, envio e consulta do estado
js/admin.js              painel de administração
sw.js                    permite abrir o app sem internet
manifest.webmanifest     ícone e nome ao instalar na tela inicial
apps-script/Codigo.gs    ← código que você cola no script.google.com
```
