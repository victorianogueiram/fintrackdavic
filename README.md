# fintrack — controle financeiro pessoal

Sistema financeiro pessoal com importação de extratos Itaú e Inter.

## Arquivos

```
fintrack/
├── index.html   — estrutura da página
├── style.css    — estilos e tema claro/escuro
├── app.js       — toda a lógica da aplicação
└── README.md    — este arquivo
```

## Como publicar na Vercel (sem terminal)

### 1. Criar conta no GitHub
- Acesse https://github.com e crie uma conta gratuita

### 2. Criar repositório
- Clique em "New repository"
- Nome: `fintrack`
- Deixe como "Public"
- Clique em "Create repository"

### 3. Fazer upload dos arquivos
- Na página do repositório, clique em "uploading an existing file"
- Arraste os 3 arquivos: `index.html`, `style.css`, `app.js`
- Clique em "Commit changes"

### 4. Publicar na Vercel
- Acesse https://vercel.com e clique em "Sign up with GitHub"
- Clique em "Add New Project"
- Selecione o repositório `fintrack`
- Clique em "Deploy"
- Pronto! Você receberá um link tipo `fintrack-xxx.vercel.app`

## Como atualizar depois

1. Edite os arquivos que o Claude gerar
2. No GitHub, abra o arquivo que mudou
3. Clique no ícone de lápis (editar)
4. Cole o novo conteúdo
5. Clique em "Commit changes"
6. A Vercel atualiza automaticamente em ~30 segundos

## Funcionalidades

- Importação de extratos CSV do Itaú (conta corrente) e Inter (cartão)
- Detecção automática de duplicatas ao reimportar
- Categorização automática por nome da transação
- Edição de nome e categoria por transação
- Criação de categorias personalizadas
- Filtros por período: 7 dias, 30 dias, semana, mês, tudo
- Busca por nome ou categoria
- Painel de meta de reserva com projeção
- Dados salvos no navegador (localStorage)
- Tema claro e escuro automático

## Formato dos extratos

**Itaú conta corrente:**
Exporte em CSV ou Excel pelo Internet Banking > Extrato > Salvar como
Colunas esperadas: `Data;Histórico;Valor`

**Inter cartão:**
Exporte em CSV pelo Super App > Cartões > Fatura > Exportar
Colunas esperadas: `Data,Descrição,Valor`
