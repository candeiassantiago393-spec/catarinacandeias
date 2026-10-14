'use strict';

const ICONES = {
  visto: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5 9.2 17 19 7"/></svg>',
  cruz: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17"/></svg>',
  estrela: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.2 14.6 8.7l6 .8-4.4 4.1 1.1 6L12 16.7 6.7 19.6l1.1-6L3.4 9.5l6-.8L12 3.2z"/></svg>',
  esquerda: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6 9 12l6 6"/></svg>',
  direita: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>'
};

const CAMPOS = ['evento', 'titulo', 'data', 'local', 'prazo', 'limiteAlbum', 'mensagem'];
const FILTROS = [
  ['todas', 'Todas'],
  ['gosto', 'Gosto'],
  ['nao', 'Não gosto'],
  ['album', 'Álbum'],
  ['pendentes', 'Por decidir'],
  ['comentarios', 'Comentários']
];

const estado = {
  galeriaId: null,
  manifest: null,
  filtro: 'todas',
  luzId: null,
  modoLuz: 'ver',
  ocupado: false,
  progresso: '',
  catalogo: null,
  formulario: null,
  manifestos: null,
  manifestNovo: null
};

const filas = {};
let pedidoNavegacao = 0;
let avisoTimer = 0;
let toqueX = null;

function el(tag, props = {}, kids) {
  const node = document.createElement(tag);
  for (const [chave, valor] of Object.entries(props)) {
    if (valor == null || valor === false) continue;
    if (chave === 'class') node.className = valor;
    else if (chave === 'text') node.textContent = String(valor);
    else if (chave === 'hidden') node.hidden = true;
    else if (chave === 'disabled') node.disabled = true;
    else if (chave.startsWith('on') && typeof valor === 'function') node.addEventListener(chave.slice(2).toLowerCase(), valor);
    else if (chave === 'value' && (tag === 'textarea' || tag === 'input' || tag === 'select')) node.value = String(valor);
    else node.setAttribute(chave, valor === true ? '' : String(valor));
  }
  if (kids != null && kids !== false) {
    const lista = Array.isArray(kids) ? kids : [kids];
    for (const kid of lista) {
      if (kid == null || kid === false) continue;
      node.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
    }
  }
  return node;
}

function icone(nome) {
  const caixa = el('span', { class: 'icone' });
  caixa.innerHTML = ICONES[nome];
  return caixa;
}

function botao(acao, texto, classe = 'secundario', extra = {}) {
  return el('button', { type: 'button', class: classe, ...extra, 'data-acao': acao, text: texto });
}

function botaoIcone(acao, nome, rotulo, extra = {}) {
  return el('button', {
    type: 'button',
    class: 'icone-botao',
    ...extra,
    'data-acao': acao,
    'aria-label': rotulo,
    title: rotulo
  }, icone(nome));
}

function jsonSeguro(chave) {
  try { return JSON.parse(localStorage.getItem(chave) || 'null'); }
  catch { return null; }
}

function peso(n) {
  const valor = Number(n) || 0;
  if (valor < 1024) return valor + ' B';
  if (valor < 1048576) return Math.round(valor / 1024) + ' KB';
  return (valor / 1048576).toFixed(1).replace('.', ',') + ' MB';
}

function dataLonga(iso) {
  if (!iso) return '';
  const partes = String(iso).split('-').map(Number);
  if (partes.length < 3 || !partes[0]) return String(iso);
  return new Date(partes[0], partes[1] - 1, partes[2]).toLocaleDateString('pt-PT', {
    day: 'numeric', month: 'long', year: 'numeric'
  });
}

function dataCurta(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('pt-PT', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
}

function prazoPassou(iso) {
  if (!iso) return false;
  const partes = String(iso).split('-').map(Number);
  if (partes.length < 3) return false;
  const fim = new Date(partes[0], partes[1] - 1, partes[2]);
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  return fim < hoje;
}

function novoId() {
  if (window.crypto?.getRandomValues) {
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  }
  return Date.now().toString(16) + Math.random().toString(16).slice(2, 10);
}

function extensao(nome, tipo) {
  const encontrado = /\.([a-z0-9]+)$/i.exec(nome || '');
  let ext = encontrado ? encontrado[1].toLowerCase() : '';
  if (ext === 'jpeg') ext = 'jpg';
  if (ext === 'jpg' || ext === 'png' || ext === 'webp') return '.' + ext;
  if (tipo === 'image/png') return '.png';
  if (tipo === 'image/webp') return '.webp';
  return '.jpg';
}

function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toast(texto) {
  const aviso = document.getElementById('aviso');
  aviso.hidden = false;
  aviso.textContent = texto;
  clearTimeout(avisoTimer);
  avisoTimer = setTimeout(() => { aviso.hidden = true; }, 7000);
}

function mensagemErro(erro) {
  const texto = (erro && erro.message) ? erro.message : 'Não consegui concluir.';
  if (/bad credentials/i.test(texto)) return 'O código do GitHub não foi aceite.';
  if (/not found/i.test(texto)) return 'Não encontrei esse repositório, ou o código não tem acesso. Confirme o nome e se o site já tem um primeiro commit.';
  if (/rate limit/i.test(texto)) return 'O GitHub pediu uma pausa. Espere um pouco e publique outra vez.';
  if (/resource not accessible|must have push access|permission/i.test(texto)) return 'Este código não pode alterar o repositório. Precisa de permissão de escrita no conteúdo.';
  if (/failed to fetch|networkerror|load failed/i.test(texto)) return 'A ligação caiu. O que já tinha sido publicado mantém-se; tente outra vez para enviar o resto.';
  return texto;
}

function catalogoInicial() {
  const contas = (CONFIG.contas || []).filter((conta) => conta.papel === 'cliente' && conta.galeria);
  return {
    clientes: contas.map((conta) => ({
      utilizador: conta.utilizador,
      palavraPasse: conta.palavraPasse,
      nome: conta.nome,
      ativo: true,
      nota: ''
    })),
    albuns: contas.map((conta) => ({
      id: conta.galeria,
      cliente: conta.utilizador,
      arquivado: false,
      titulo: '',
      evento: ''
    }))
  };
}

function normalizarCatalogo(dados) {
  const clientes = [];
  const vistos = new Set();
  for (const item of (Array.isArray(dados?.clientes) ? dados.clientes : [])) {
    const utilizador = String(item?.utilizador || '').trim().toLowerCase();
    if (!/^[a-z0-9]{3,20}$/.test(utilizador) || vistos.has(utilizador)) continue;
    if ((CONFIG.contas || []).some((conta) => conta.papel === 'fotografa' && conta.utilizador === utilizador)) continue;
    vistos.add(utilizador);
    clientes.push({
      utilizador,
      palavraPasse: String(item.palavraPasse || ''),
      nome: String(item.nome || utilizador).trim() || utilizador,
      ativo: item.ativo !== false,
      nota: String(item.nota || '').slice(0, 500)
    });
  }
  const albuns = [];
  const ids = new Set();
  for (const item of (Array.isArray(dados?.albuns) ? dados.albuns : [])) {
    const id = String(item?.id || '').trim();
    if (!nomeValido(id) || ids.has(id)) continue;
    ids.add(id);
    const cliente = String(item.cliente || '').trim().toLowerCase();
    albuns.push({
      id,
      cliente: clientes.some((conta) => conta.utilizador === cliente) ? cliente : '',
      arquivado: !!item.arquivado,
      titulo: String(item.titulo || '').slice(0, 120),
      evento: String(item.evento || '').slice(0, 80)
    });
  }
  return { clientes, albuns };
}

async function obterCatalogo() {
  try {
    const resposta = await fetch(new URL('dados/estudio.json', document.baseURI), { cache: 'no-store' });
    if (!resposta.ok) return catalogoInicial();
    return normalizarCatalogo(await resposta.json());
  } catch {
    return catalogoInicial();
  }
}

function clientes() {
  return estado.catalogo?.clientes || [];
}

function albunsVisiveis() {
  return estado.catalogo?.albuns || [];
}

function albunsDo(utilizador, incluirOcultos) {
  return albunsVisiveis().filter((album) => album.cliente === utilizador && (incluirOcultos || !album.arquivado));
}

function albumPorId(id) {
  return albunsVisiveis().find((album) => album.id === id) || null;
}

function clonarCatalogo() {
  return JSON.parse(JSON.stringify(estado.catalogo || catalogoInicial()));
}

function contaFotografa() {
  return (CONFIG.contas || []).find((conta) => conta.papel === 'fotografa') || null;
}

function sessao() {
  const guardada = jsonSeguro('cc-sessao');
  if (!guardada?.utilizador) return null;
  const host = (CONFIG.contas || []).find((conta) => conta.papel === 'fotografa' && conta.utilizador === guardada.utilizador);
  if (host) return host;
  const cliente = clientes().find((conta) => conta.utilizador === guardada.utilizador && conta.ativo !== false);
  if (!cliente) return null;
  return { ...cliente, papel: 'cliente' };
}

function contaDaGaleria(id) {
  const album = albumPorId(id);
  if (!album) return null;
  const cliente = clientes().find((conta) => conta.utilizador === album.cliente);
  if (cliente) return { ...cliente, papel: 'cliente', galeria: id };
  return { utilizador: '', palavraPasse: '', nome: 'Por atribuir', papel: 'cliente', galeria: id, ativo: true };
}

function clientePodeVer(conta, id) {
  const album = albumPorId(id);
  return !!(album && conta && album.cliente === conta.utilizador && !album.arquivado);
}

function destinoCliente(conta) {
  const lista = albunsDo(conta.utilizador, false);
  if (lista.length === 1) return '#/sala/' + lista[0].id;
  return '#/albuns';
}

function mensagemPadrao(nome) {
  return `Olá, ${nome}. O visto fica nas fotografias que querem guardar, a cruz nas que podem dispensar. A estrela marca as que querem destacar. Podem escrever em qualquer imagem. No fim, enviem a seleção pelo botão em baixo.`;
}

function palavraPasseNova() {
  const partes = ['Mar', 'Sol', 'Rio', 'Luz', 'Mel', 'Vela', 'Norte', 'Oliva', 'Bruma', 'Duna', 'Campo', 'Serra'];
  const n = (max) => {
    if (window.crypto?.getRandomValues) {
      const bytes = new Uint8Array(1);
      crypto.getRandomValues(bytes);
      return bytes[0] % max;
    }
    return Math.floor(Math.random() * max);
  };
  const a = partes[n(partes.length)];
  let b = partes[n(partes.length)];
  if (b === a) b = partes[(partes.indexOf(a) + 3) % partes.length];
  return a + b + String(10 + n(89));
}

function utilizadorLivre(nome) {
  const reservados = new Set((CONFIG.contas || []).filter((conta) => conta.papel === 'fotografa').map((conta) => conta.utilizador));
  for (const conta of clientes()) reservados.add(conta.utilizador);
  let base = String(nome || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 16);
  if (base.length < 3) base = 'cliente';
  let candidato = base;
  let i = 2;
  while (reservados.has(candidato)) {
    candidato = (base + i).slice(0, 20);
    i += 1;
    if (i > 40) return 'cliente' + novoId().slice(0, 4);
  }
  return candidato;
}

function idAlbum(titulo) {
  const usados = new Set(albunsVisiveis().map((album) => album.id));
  const base = String(titulo || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 28);
  for (let i = 0; i < 6; i += 1) {
    const id = (base || 'album') + '-' + novoId().slice(0, 4);
    if (nomeValido(id) && !usados.has(id)) return id;
  }
  return 'album-' + novoId();
}

function tituloAlbum(album, manifesto) {
  return manifesto?.titulo || album.titulo || 'Álbum por nomear';
}

async function commitJson(ficheiros, mensagem) {
  const repo = repositorio();
  if (!nomeValido(repo.owner) || !nomeValido(repo.repo) || (repo.branch && !nomeValido(repo.branch))) {
    throw new Error('Neste computador ainda falta a ligação inicial. Quem montou o site trata disso uma vez. Depois, a fotógrafa só larga as fotografias.');
  }
  if (!GITHUB.token()) {
    throw new Error('Neste computador ainda falta a ligação inicial. Quem montou o site trata disso uma vez. Depois, a fotógrafa só larga as fotografias.');
  }
  const info = await GITHUB.pedido(`/repos/${repo.owner}/${repo.repo}`);
  if (info.permissions && info.permissions.push === false) {
    throw new Error('Este código consegue ver o repositório, mas não escrever.');
  }
  const branch = repo.branch || info.default_branch;
  const tree = [];
  for (const ficheiro of ficheiros) {
    const blob = new Blob([JSON.stringify(ficheiro.dados, null, 2) + '\n'], { type: 'application/json' });
    const sha = await GITHUB.criarBlob(repo.owner, repo.repo, await blobBase64(blob));
    tree.push({ path: ficheiro.caminho, mode: '100644', type: 'blob', sha });
  }
  await GITHUB.commit(repo.owner, repo.repo, branch, tree, mensagem);
}

async function gravarCatalogo(catalogo, mensagem) {
  await commitJson([{ caminho: 'dados/estudio.json', dados: catalogo }], mensagem);
  estado.catalogo = catalogo;
}

async function gravarMetaNoCatalogo(id, meta) {
  const atual = albumPorId(id);
  if (!atual || (atual.titulo === meta.titulo && atual.evento === meta.evento)) return;
  const catalogo = clonarCatalogo();
  const album = catalogo.albuns.find((item) => item.id === id);
  if (!album) return;
  album.titulo = meta.titulo;
  album.evento = meta.evento;
  await gravarCatalogo(catalogo, 'Atualizar ' + (meta.titulo || id));
}

function detetarAutomatico() {
  const host = location.hostname;
  if (!host.endsWith('.github.io')) return { owner: '', repo: '', branch: '' };
  const owner = host.slice(0, -'.github.io'.length);
  const partes = location.pathname.split('/').filter(Boolean);
  const primeiro = partes[0] && partes[0] !== 'index.html' ? partes[0] : '';
  if (!primeiro) return { owner, repo: owner + '.github.io', branch: '' };
  return { owner, repo: primeiro, branch: '' };
}

function repositorio() {
  const guardado = jsonSeguro('cc-repo') || {};
  const auto = detetarAutomatico();
  const cfg = CONFIG.repositorio || {};
  return {
    owner: String(guardado.owner || cfg.owner || auto.owner || '').trim(),
    repo: String(guardado.repo || cfg.repo || auto.repo || '').trim(),
    branch: String(guardado.branch || cfg.branch || auto.branch || '').trim()
  };
}

function nomeValido(valor) {
  return /^[\w.-]+$/.test(valor) && !valor.includes('..');
}

function urlDoSite() {
  if (location.protocol === 'file:') return '';
  return new URL('./', document.baseURI).href;
}

function urlFoto(galeriaId, relativo, versao) {
  const partes = ['galerias', galeriaId, ...String(relativo || '').split('/')].map(encodeURIComponent).join('/');
  const url = new URL(partes, document.baseURI);
  if (versao) url.searchParams.set('v', versao);
  return url.href;
}

function filaDe(id) {
  if (!filas[id]) filas[id] = [];
  return filas[id];
}

function normalizarManifest(manifesto, id) {
  const base = {
    id,
    evento: '',
    titulo: '',
    data: '',
    local: '',
    prazo: '',
    limiteAlbum: 30,
    mensagem: '',
    fotos: [],
    atualizado: null
  };
  const junto = { ...base, ...(manifesto || {}), id };
  junto.fotos = Array.isArray(manifesto?.fotos) ? manifesto.fotos.filter((foto) => foto && foto.id) : [];
  return junto;
}

async function carregarManifest(id) {
  const resposta = await fetch(new URL(`galerias/${id}/manifest.json`, document.baseURI), { cache: 'no-store' });
  if (!resposta.ok) throw new Error('Não encontrei a sala.');
  return normalizarManifest(await resposta.json(), id);
}

async function carregarManifestOuVazio(id) {
  if (estado.manifestNovo?.id === id) {
    const manifesto = estado.manifestNovo;
    estado.manifestNovo = null;
    return manifesto;
  }
  try {
    return await carregarManifest(id);
  } catch (erro) {
    const album = albumPorId(id);
    if (!album || !/Não encontrei a sala/.test(erro?.message || '')) throw erro;
    const dono = clientes().find((conta) => conta.utilizador === album.cliente);
    return normalizarManifest({
      id,
      titulo: album.titulo || '',
      evento: album.evento || '',
      limiteAlbum: 0,
      mensagem: dono ? mensagemPadrao(dono.nome) : '',
      fotos: []
    }, id);
  }
}

function selecaoVazia(id) {
  return { tipo: 'selecao-catarina', versao: 1, galeria: id, nota: '', fotos: {}, atualizado: null, enviadoEm: null };
}

function lerSelecao(id) {
  const obj = jsonSeguro('cc-selecao-' + id);
  if (!obj || obj.galeria !== id || !obj.fotos) return selecaoVazia(id);
  return obj;
}

function guardarSelecao(sel) {
  localStorage.setItem('cc-selecao-' + sel.galeria, JSON.stringify(sel));
}

function entradaSelecao(sel, id) {
  if (!sel.fotos[id]) sel.fotos[id] = { voto: null, album: false, comentario: '' };
  return sel.fotos[id];
}

function lerRecebida(id) {
  const obj = jsonSeguro('cc-recebida-' + id);
  if (!obj || obj.galeria !== id) return null;
  return obj;
}

function lerRascunho(id) {
  return jsonSeguro('cc-rascunho-' + id);
}

function guardarRascunhoDoFormulario() {
  const form = document.querySelector('.preparar');
  if (!form || !estado.galeriaId) return;
  const dados = {};
  form.querySelectorAll('[data-campo]').forEach((campo) => { dados[campo.dataset.campo] = campo.value; });
  localStorage.setItem('cc-rascunho-' + estado.galeriaId, JSON.stringify(dados));
}

function aplicarRascunho(manifesto, rascunho) {
  const saida = { ...manifesto };
  if (!rascunho) return saida;
  for (const campo of CAMPOS) {
    if (rascunho[campo] != null) saida[campo] = rascunho[campo];
  }
  return saida;
}

function fotosUteis(manifesto) {
  return (manifesto?.fotos || []).filter((foto) => foto && foto.id && (foto.previa || foto.original));
}

function resumoDe(manifesto, sel) {
  const fotos = fotosUteis(manifesto);
  const contagem = { total: fotos.length, gosto: 0, nao: 0, album: 0, comentarios: 0, decididas: 0, pendentes: 0 };
  for (const foto of fotos) {
    const marca = sel?.fotos?.[foto.id] || {};
    if (marca.voto === 'gosto') contagem.gosto += 1;
    if (marca.voto === 'nao') contagem.nao += 1;
    if (marca.voto) contagem.decididas += 1;
    if (marca.album) contagem.album += 1;
    if ((marca.comentario || '').trim()) contagem.comentarios += 1;
  }
  contagem.pendentes = contagem.total - contagem.decididas;
  return contagem;
}

function fotosVisiveis() {
  const todas = fotosUteis(estado.manifest);
  const sel = lerSelecao(estado.galeriaId);
  return todas.filter((foto) => {
    const marca = sel.fotos[foto.id] || {};
    if (estado.filtro === 'gosto') return marca.voto === 'gosto';
    if (estado.filtro === 'nao') return marca.voto === 'nao';
    if (estado.filtro === 'album') return !!marca.album;
    if (estado.filtro === 'pendentes') return !marca.voto;
    if (estado.filtro === 'comentarios') return !!(marca.comentario || '').trim();
    return true;
  });
}

function numeroDe(foto) {
  const indice = fotosUteis(estado.manifest).findIndex((item) => item.id === foto.id);
  return String(indice + 1).padStart(2, '0');
}

function textoRecado(conta) {
  const endereco = urlDoSite() || 'o endereço do site';
  const linhas = [
    `Olá, ${conta.nome}.`,
    '',
    'As fotografias já estão prontas para verem:',
    endereco,
    '',
    `Utilizador: ${conta.utilizador}`,
    `Palavra-passe: ${conta.palavraPasse}`,
    ''
  ];
  if (albunsDo(conta.utilizador, false).length > 1) {
    linhas.push('Há mais do que um trabalho. Depois de entrar, escolham o álbum.');
    linhas.push('');
  }
  linhas.push('Entrem e marquem com o visto as que gostam e com a cruz as que não querem. A estrela é para o álbum. Podem deixar comentários. No fim, carreguem em «Enviar seleção».');
  return linhas.join('\n');
}

async function copiar(texto) {
  try {
    await navigator.clipboard.writeText(texto);
  } catch {
    const area = el('textarea', { value: texto });
    document.body.append(area);
    area.select();
    document.execCommand('copy');
    area.remove();
  }
  toast('Copiado.');
}

function descarregar(nome, conteudo, tipo) {
  const blob = conteudo instanceof Blob ? conteudo : new Blob([conteudo], { type: tipo });
  const ligacao = el('a', { href: URL.createObjectURL(blob), download: nome });
  document.body.append(ligacao);
  ligacao.click();
  ligacao.remove();
  setTimeout(() => URL.revokeObjectURL(ligacao.href), 2500);
}

function campoCsv(valor) {
  const texto = String(valor ?? '');
  const seguro = /^[=+\-@]/.test(texto) ? "'" + texto : texto;
  return '"' + seguro.replace(/"/g, '""') + '"';
}

function pedirConfirmacao(texto, confirmar) {
  return new Promise((resolve) => {
    const fundo = el('div', { class: 'confirma', role: 'alertdialog', 'aria-modal': 'true', 'aria-label': texto }, [
      el('div', { class: 'caixa' }, [
        el('p', { text: texto }),
        el('div', { class: 'acoes' }, [
          botao('confirmar-sim', confirmar || 'Confirmar', 'primario'),
          botao('confirmar-nao', 'Cancelar', 'secundario')
        ])
      ])
    ]);
    function fechar(valor) {
      window.removeEventListener('keydown', aoTecla);
      fundo.remove();
      resolve(valor);
    }
    function aoTecla(evento) {
      if (evento.key === 'Escape') fechar(false);
    }
    fundo.addEventListener('click', (evento) => {
      if (evento.target === fundo) fechar(false);
      const alvo = evento.target.closest('[data-acao]');
      if (!alvo) return;
      if (alvo.dataset.acao === 'confirmar-sim') fechar(true);
      if (alvo.dataset.acao === 'confirmar-nao') fechar(false);
    });
    window.addEventListener('keydown', aoTecla);
    document.body.append(fundo);
    fundo.querySelector('[data-acao="confirmar-nao"]').focus();
  });
}

const GITHUB = {
  token() { return localStorage.getItem('cc-token') || ''; },
  async pedido(caminho, opcoes = {}) {
    const resposta = await fetch('https://api.github.com' + caminho, {
      method: opcoes.method || 'GET',
      body: opcoes.body ? JSON.stringify(opcoes.body) : undefined,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: 'Bearer ' + this.token(),
        'X-GitHub-Api-Version': '2022-11-28',
        ...(opcoes.body ? { 'Content-Type': 'application/json' } : {})
      }
    });
    if (resposta.status === 204) return null;
    const dados = await resposta.json().catch(() => ({}));
    if (!resposta.ok) {
      const erro = new Error(dados.message || resposta.statusText || 'Erro no GitHub');
      erro.status = resposta.status;
      throw erro;
    }
    return dados;
  },
  async criarBlob(owner, repo, base64) {
    const dados = await this.pedido(`/repos/${owner}/${repo}/git/blobs`, {
      method: 'POST',
      body: { content: base64, encoding: 'base64' }
    });
    return dados.sha;
  },
  async commit(owner, repo, branch, treeItems, message) {
    for (let tentativa = 0; tentativa < 2; tentativa += 1) {
      try {
        const ref = await this.pedido(`/repos/${owner}/${repo}/git/ref/heads/${branch}`);
        const commitAtual = await this.pedido(`/repos/${owner}/${repo}/git/commits/${ref.object.sha}`);
        const arvore = await this.pedido(`/repos/${owner}/${repo}/git/trees`, {
          method: 'POST',
          body: { base_tree: commitAtual.tree.sha, tree: treeItems }
        });
        const novo = await this.pedido(`/repos/${owner}/${repo}/git/commits`, {
          method: 'POST',
          body: { message, tree: arvore.sha, parents: [ref.object.sha] }
        });
        await this.pedido(`/repos/${owner}/${repo}/git/refs/heads/${branch}`, {
          method: 'PATCH',
          body: { sha: novo.sha }
        });
        return novo;
      } catch (erro) {
        if (tentativa === 0 && /fast forward|reference|update/i.test(erro.message || '')) continue;
        throw erro;
      }
    }
    return null;
  }
};

function base64ParaTexto(base64) {
  const limpo = String(base64 || '').replace(/\s/g, '');
  const binario = atob(limpo);
  const bytes = Uint8Array.from(binario, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function blobBase64(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binario = '';
  const passo = 4096;
  for (let i = 0; i < bytes.length; i += passo) {
    binario += String.fromCharCode.apply(null, bytes.subarray(i, i + passo));
  }
  return btoa(binario);
}

async function abrirImagem(file) {
  if (typeof createImageBitmap === 'function') {
    let bitmap;
    try { bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
    catch { bitmap = await createImageBitmap(file); }
    return {
      width: bitmap.width,
      height: bitmap.height,
      draw(ctx, w, h) { ctx.drawImage(bitmap, 0, 0, w, h); },
      close() { bitmap.close?.(); }
    };
  }
  const url = URL.createObjectURL(file);
  const imagem = await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('imagem'));
    img.src = url;
  });
  return {
    width: imagem.naturalWidth,
    height: imagem.naturalHeight,
    draw(ctx, w, h) { ctx.drawImage(imagem, 0, 0, w, h); },
    close() { URL.revokeObjectURL(url); }
  };
}

async function criarPrevia(file) {
  const imagem = await abrirImagem(file);
  try {
    const largura = imagem.width;
    const altura = imagem.height;
    const escala = Math.min(1, 1600 / Math.max(largura, altura, 1));
    const w = Math.max(1, Math.round(largura * escala));
    const h = Math.max(1, Math.round(altura * escala));
    const tela = document.createElement('canvas');
    tela.width = w;
    tela.height = h;
    const ctx = tela.getContext('2d', { alpha: false });
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.fillStyle = '#0c0b0a';
    ctx.fillRect(0, 0, w, h);
    imagem.draw(ctx, w, h);
    const blob = await new Promise((resolve, reject) => {
      tela.toBlob((resultado) => resultado ? resolve(resultado) : reject(new Error('prévia')), 'image/jpeg', 0.82);
    });
    return { blob, largura, altura };
  } finally {
    imagem.close();
  }
}

async function lerManifestAtual(owner, repo, branch, id) {
  try {
    const item = await GITHUB.pedido(`/repos/${owner}/${repo}/contents/galerias/${id}/manifest.json?ref=${encodeURIComponent(branch)}`);
    return normalizarManifest(JSON.parse(base64ParaTexto(item.content)), id);
  } catch (erro) {
    if (erro.status !== 404) throw erro;
    try { return await carregarManifest(id); }
    catch { return normalizarManifest({ id }, id); }
  }
}

function definirProgresso(texto) {
  estado.progresso = texto;
  const nodo = document.getElementById('progresso-publicacao');
  if (nodo) nodo.textContent = texto;
}

async function publicarSala(galeriaId, ficheiros, meta, onLote) {
  const repo = repositorio();
  if (!nomeValido(repo.owner) || !nomeValido(repo.repo)) {
    throw new Error('Falta o utilizador ou o nome do repositório no GitHub.');
  }
  if (repo.branch && !nomeValido(repo.branch)) throw new Error('O nome do ramo não serve.');
  if (!GITHUB.token()) throw new Error('Neste computador ainda falta a ligação inicial. Quem montou o site trata disso uma vez. Depois, a fotógrafa só larga as fotografias.');

  const info = await GITHUB.pedido(`/repos/${repo.owner}/${repo.repo}`);
  if (info.permissions && info.permissions.push === false) {
    throw new Error('Este código consegue ver o repositório, mas não escrever.');
  }
  const branch = repo.branch || info.default_branch;
  let manifesto = await lerManifestAtual(repo.owner, repo.repo, branch, galeriaId);
  manifesto = {
    ...manifesto,
    evento: meta.evento,
    titulo: meta.titulo,
    data: meta.data,
    local: meta.local,
    prazo: meta.prazo,
    limiteAlbum: meta.limiteAlbum,
    mensagem: meta.mensagem,
    id: galeriaId,
    fotos: manifesto.fotos.slice()
  };

  const lotes = [];
  for (let i = 0; i < ficheiros.length; i += 6) lotes.push(ficheiros.slice(i, i + 6));
  if (!lotes.length) {
    manifesto.atualizado = new Date().toISOString();
    const sha = await GITHUB.criarBlob(repo.owner, repo.repo, await blobBase64(new Blob([JSON.stringify(manifesto, null, 2)], { type: 'application/json' })));
    await GITHUB.commit(repo.owner, repo.repo, branch, [
      { path: `galerias/${galeriaId}/manifest.json`, mode: '100644', type: 'blob', sha }
    ], `Atualizar a sala ${galeriaId}`);
    return manifesto;
  }

  let feitos = 0;
  for (const lote of lotes) {
    const seguinte = JSON.parse(JSON.stringify(manifesto));
    const arvore = [];
    for (const file of lote) {
      feitos += 1;
      definirProgresso(`A enviar ${file.name} (${feitos} de ${ficheiros.length})…`);
      let previa = null;
      try { previa = await criarPrevia(file); }
      catch { previa = null; }
      const id = novoId();
      const ext = extensao(file.name, file.type);
      const original = `originais/${id}${ext}`;
      const caminhoPrevia = previa ? `previas/${id}.jpg` : original;
      try {
        const shaOriginal = await GITHUB.criarBlob(repo.owner, repo.repo, await blobBase64(file));
        arvore.push({ path: `galerias/${galeriaId}/${original}`, mode: '100644', type: 'blob', sha: shaOriginal });
        if (previa) {
          const shaPrevia = await GITHUB.criarBlob(repo.owner, repo.repo, await blobBase64(previa.blob));
          arvore.push({ path: `galerias/${galeriaId}/${caminhoPrevia}`, mode: '100644', type: 'blob', sha: shaPrevia });
        }
      } catch (erro) {
        throw new Error(`Não consegui enviar «${file.name}». ${erro.message || ''}`);
      }
      seguinte.fotos.push({
        id,
        nome: file.name,
        original,
        previa: caminhoPrevia,
        largura: previa ? previa.largura : 0,
        altura: previa ? previa.altura : 0,
        bytes: file.size
      });
      await esperar(120);
    }
    seguinte.atualizado = new Date().toISOString();
    const shaManifesto = await GITHUB.criarBlob(repo.owner, repo.repo, await blobBase64(new Blob([JSON.stringify(seguinte, null, 2)], { type: 'application/json' })));
    arvore.push({ path: `galerias/${galeriaId}/manifest.json`, mode: '100644', type: 'blob', sha: shaManifesto });
    definirProgresso(`A guardar ${feitos} de ${ficheiros.length} no site…`);
    await GITHUB.commit(repo.owner, repo.repo, branch, arvore, `Fotografias para ${galeriaId} (${feitos}/${ficheiros.length})`);
    manifesto = seguinte;
    onLote(lote);
  }
  return manifesto;
}

async function removerFotoPublicada(foto) {
  const ok = await pedirConfirmacao(`Remover «${foto.nome}» desta sala? O cliente deixa de a ver.`, 'Remover');
  if (!ok) return;
  const repo = repositorio();
  if (!GITHUB.token() || !nomeValido(repo.owner) || !nomeValido(repo.repo)) {
    toast('Para remover do site, ligue primeiro o GitHub.');
    return;
  }
  estado.ocupado = true;
  definirProgresso('A remover…');
  try {
    const info = await GITHUB.pedido(`/repos/${repo.owner}/${repo.repo}`);
    const branch = repo.branch || info.default_branch;
    const manifesto = await lerManifestAtual(repo.owner, repo.repo, branch, estado.galeriaId);
    manifesto.fotos = manifesto.fotos.filter((item) => item.id !== foto.id);
    manifesto.atualizado = new Date().toISOString();
    const arvore = [
      { path: `galerias/${estado.galeriaId}/${foto.original}`, mode: '100644', type: 'blob', sha: null }
    ];
    if (foto.previa && foto.previa !== foto.original) {
      arvore.push({ path: `galerias/${estado.galeriaId}/${foto.previa}`, mode: '100644', type: 'blob', sha: null });
    }
    const sha = await GITHUB.criarBlob(repo.owner, repo.repo, await blobBase64(new Blob([JSON.stringify(manifesto, null, 2)], { type: 'application/json' })));
    arvore.push({ path: `galerias/${estado.galeriaId}/manifest.json`, mode: '100644', type: 'blob', sha });
    await GITHUB.commit(repo.owner, repo.repo, branch, arvore, `Remover fotografia de ${estado.galeriaId}`);
    toast('Fotografia removida. Pode demorar um minuto a desaparecer para o cliente.');
    estado.ocupado = false;
    guardarRascunhoDoFormulario();
    navegar();
  } catch (erro) {
    estado.ocupado = false;
    definirProgresso('');
    toast(mensagemErro(erro));
  }
}

function topo(conta, kicker) {
  const destino = conta.papel === 'fotografa' ? '#/estudio' : destinoCliente(conta);
  return el('header', { class: 'topo' }, [
    el('div', {}, [
      el('a', { class: 'marca', href: destino, text: CONFIG.nome }),
      el('p', { class: 'kicker', text: kicker || 'Sala de provas' })
    ]),
    botao('sair', 'Sair', 'texto nao-imprimir')
  ]);
}

function campoTexto(id, etiqueta, valor, extra = {}) {
  return el('label', { text: etiqueta }, el('input', { id, value: valor || '', ...extra }));
}

function pintarLogin(mensagem) {
  document.title = CONFIG.nome + ' — Sala de provas';
  const app = document.getElementById('app');
  app.className = '';
  app.replaceChildren(el('section', { class: 'login' }, [
    el('p', { class: 'kicker', text: 'Sala de provas' }),
    el('h1', { text: CONFIG.nome }),
    el('div', { class: 'login-corpo' }, [
      el('form', { 'data-acao': 'entrar' }, [
        campoTexto('utilizador', 'Utilizador', '', { autocomplete: 'username', required: true }),
        el('label', { text: 'Palavra-passe' }, el('input', { id: 'palavra-passe', type: 'password', autocomplete: 'current-password', required: true })),
        el('p', { class: 'erro', role: 'alert', text: mensagem || '' }),
        el('div', { class: 'acoes' }, [el('button', { type: 'submit', class: 'primario', text: 'Entrar' })])
      ]),
      el('p', { class: 'lede', text: 'Cada cliente vê só a sua sala. Visto no que fica, cruz no que sai, estrela no que querem destacar.' })
    ])
  ]));
  document.getElementById('utilizador').focus();
}

function blocoLigacao(compacto) {
  const repo = repositorio();
  const ligado = jsonSeguro('cc-ligado');
  const temToken = !!GITHUB.token();
  if (compacto) {
    if (temToken) return null;
    return el('p', { class: 'aviso-suave nao-imprimir', text: 'Neste computador ainda falta a ligação inicial. Quem montou o site trata disso uma vez, no fundo do estúdio. A fotógrafa depois só larga as fotografias.' });
  }
  return el('details', { class: 'ligacao nao-imprimir', open: temToken ? null : true }, [
    el('summary', { text: temToken ? 'Ligação inicial feita neste computador' : 'Ligação inicial do site, uma vez' }),
    el('p', { class: 'sub', text: 'Isto não é trabalho da fotógrafa. Quem montou o site cola aqui um código, uma vez, neste computador. A partir daí ela entra, abre o álbum e larga as fotografias.' }),
    temToken
      ? el('p', { class: 'sub', text: 'Ligado a ' + ((ligado && ligado.fullName) || (repo.owner + '/' + repo.repo)) + '.' })
      : el('p', { class: 'aviso-suave', text: 'O código é só deste repositório, com Contents em leitura e escrita. O GitHub mostra-o uma vez. Não fica gravado no site.' }),
    el('p', { class: 'aviso-suave' }, [
      el('a', { href: 'https://github.com/settings/personal-access-tokens/new', target: '_blank', rel: 'noopener noreferrer', text: 'Criar o código' })
    ]),
    el('div', { class: 'duas' }, [
      campoTexto('campo-owner', 'Utilizador GitHub', repo.owner, { autocomplete: 'off', spellcheck: 'false' }),
      campoTexto('campo-repo', 'Repositório', repo.repo, { autocomplete: 'off', spellcheck: 'false' })
    ]),
    campoTexto('campo-branch', 'Ramo, se não for o principal', repo.branch, { placeholder: 'main', autocomplete: 'off', spellcheck: 'false' }),
    el('label', { text: 'Código' }, el('input', { id: 'campo-token', type: 'password', autocomplete: 'off', spellcheck: 'false', placeholder: temToken ? 'Já está guardado. Cole outro para substituir.' : 'github_pat_…' })),
    el('div', { class: 'acoes' }, [
      botao('guardar-token', temToken ? 'Testar outra vez' : 'Guardar e testar', 'primario'),
      temToken ? botao('esquecer-token', 'Esquecer o código', 'texto perigo') : null
    ])
  ]);
}

function selectCliente(album) {
  const select = el('select', { 'data-acao': 'atribuir-album', 'data-id': album.id, 'aria-label': 'Cliente deste álbum' });
  select.append(el('option', { value: '', text: 'Por atribuir' }));
  for (const cliente of clientes()) {
    select.append(el('option', { value: cliente.utilizador, text: cliente.nome + (cliente.ativo === false ? ' · desativado' : '') }));
  }
  select.value = album.cliente || '';
  return el('label', { class: 'select-cliente', text: 'Cliente' }, select);
}

function linhaAlbum(album, manifesto) {
  const fotos = manifesto ? fotosUteis(manifesto).length : null;
  const recebida = lerRecebida(album.id);
  let detalhe = 'Ainda a chegar ao site. Atualize daqui a um minuto.';
  if (manifesto) {
    detalhe = fotos === 0 ? 'Ainda sem fotografias' : `${fotos} ${fotos === 1 ? 'fotografia' : 'fotografias'}`;
    if (manifesto.prazo) detalhe += ' · até ' + dataLonga(manifesto.prazo);
  }
  return el('article', { class: 'album-linha' + (album.arquivado ? ' oculto' : '') }, [
    el('div', {}, [
      el('p', { class: 'kicker', text: album.arquivado ? 'Oculto para o cliente' : (manifesto?.evento || album.evento || 'Álbum') }),
      el('h3', { text: tituloAlbum(album, manifesto) }),
      el('p', { class: 'sub', text: detalhe }),
      recebida ? el('p', { class: 'sub', text: 'Seleção recebida' + (recebida.recebidoEm ? ' · ' + dataCurta(recebida.recebidoEm) : '') }) : null,
      selectCliente(album)
    ]),
    el('div', { class: 'lado nao-imprimir' }, [
      el('a', { class: 'secundario', href: '#/estudio/' + album.id, text: 'Preparar' }),
      el('a', { class: 'texto', href: '#/sala/' + album.id, text: 'Ver sala' }),
      botao(album.arquivado ? 'mostrar-album' : 'ocultar-album', album.arquivado ? 'Mostrar' : 'Ocultar', 'texto', { 'data-id': album.id })
    ])
  ]);
}

function painelFormulario() {
  const form = estado.formulario;
  if (!form) return null;
  if (form.tipo === 'cliente') {
    return el('section', { class: 'painel-form', id: 'painel-form' }, [
      el('h3', { text: form.modo === 'novo' ? 'Novo cliente' : 'Editar cliente' }),
      el('p', { class: 'sub', text: 'Isto fica gravado no site. O cliente só entra noutro aparelho depois de guardar.' }),
      campoTexto('form-nome', 'Nome', form.nome, { autocomplete: 'off', maxlength: '80' }),
      campoTexto('form-utilizador', 'Utilizador', form.utilizador, { autocomplete: 'off', spellcheck: 'false', maxlength: '20', 'data-auto': form.modo === 'novo' ? '1' : '0' }),
      campoTexto('form-passe', 'Palavra-passe', form.palavraPasse, { autocomplete: 'off', spellcheck: 'false', maxlength: '80' }),
      el('label', { text: 'Nota interna' }, el('textarea', { id: 'form-nota', rows: '2', maxlength: '500', value: form.nota || '' })),
      el('p', { class: 'aviso-suave', text: 'A nota fica só no estúdio. O cliente não a vê.' }),
      el('div', { class: 'acoes' }, [
        botao('guardar-cliente', 'Guardar no site', 'primario'),
        botao('nova-passe', 'Gerar outra palavra-passe', 'texto'),
        botao('cancelar-form', 'Cancelar', 'texto')
      ])
    ]);
  }
  if (form.tipo === 'album') {
    const select = el('select', { id: 'form-cliente', 'aria-label': 'Cliente do álbum' });
    for (const cliente of clientes()) {
      select.append(el('option', { value: cliente.utilizador, text: cliente.nome + (cliente.ativo === false ? ' · desativado' : '') }));
    }
    select.value = form.cliente || (clientes()[0]?.utilizador || '');
    return el('section', { class: 'painel-form', id: 'painel-form' }, [
      el('h3', { text: 'Novo álbum' }),
      el('p', { class: 'sub', text: 'Cada álbum é uma sala. O mesmo cliente pode ter várias: casamento, sessão, retrato, o que for.' }),
      campoTexto('form-titulo', 'Nome do álbum', form.titulo, { autocomplete: 'off', maxlength: '120', placeholder: 'Casamento, sessão, retrato…' }),
      campoTexto('form-evento', 'Tipo de trabalho', form.evento, { autocomplete: 'off', maxlength: '80', placeholder: 'Casamento, batizado, família…' }),
      clientes().length ? el('label', { text: 'Cliente' }, select) : el('p', { class: 'aviso-suave', text: 'Crie primeiro um cliente.' }),
      el('div', { class: 'acoes' }, [
        clientes().length ? botao('guardar-album', 'Criar álbum', 'primario') : null,
        botao('cancelar-form', 'Cancelar', 'texto')
      ])
    ]);
  }
  return null;
}

function pintarEstudio(ticket, manifestos) {
  const conta = sessao();
  document.title = 'Estúdio — ' + CONFIG.nome;
  const lista = el('div', { class: 'salas' });
  const ordenados = clientes().slice().sort((a, b) => Number(a.ativo === false) - Number(b.ativo === false) || a.nome.localeCompare(b.nome, 'pt'));
  if (!ordenados.length) {
    lista.append(el('p', { class: 'sub', text: 'Ainda não há clientes. Crie o primeiro e depois o álbum.' }));
  }
  for (const cliente of ordenados) {
    const albuns = albunsVisiveis().filter((album) => album.cliente === cliente.utilizador);
    lista.append(el('section', { class: 'cliente-bloco' + (cliente.ativo === false ? ' desativado' : '') }, [
      el('p', { class: 'kicker', text: cliente.ativo === false ? 'Acesso desativado' : 'Cliente' }),
      el('h3', { text: cliente.nome }),
      el('p', { class: 'credenciais', text: cliente.utilizador + '  ·  ' + cliente.palavraPasse }),
      cliente.nota ? el('p', { class: 'sub', text: cliente.nota }) : null,
      el('div', { class: 'acoes nao-imprimir' }, [
        botao('copiar-recado', 'Copiar recado', 'texto', { 'data-utilizador': cliente.utilizador }),
        botao('editar-cliente', 'Editar', 'texto', { 'data-utilizador': cliente.utilizador }),
        botao('novo-album', 'Novo álbum', 'texto', { 'data-utilizador': cliente.utilizador }),
        botao(cliente.ativo === false ? 'reativar-cliente' : 'desativar-cliente', cliente.ativo === false ? 'Reativar' : 'Desativar', 'texto', { 'data-utilizador': cliente.utilizador }),
        botao('retirar-cliente', 'Retirar acesso', 'texto perigo', { 'data-utilizador': cliente.utilizador })
      ]),
      albuns.length
        ? el('div', { class: 'albuns-cliente' }, albuns.map((album) => linhaAlbum(album, manifestos[album.id])))
        : el('p', { class: 'sub', text: 'Ainda sem álbum.' })
    ]));
  }
  const soltos = albunsVisiveis().filter((album) => !album.cliente);
  if (soltos.length) {
    lista.append(el('section', { class: 'cliente-bloco' }, [
      el('p', { class: 'kicker', text: 'Sem cliente' }),
      el('h3', { text: 'Álbuns por atribuir' }),
      el('p', { class: 'sub', text: 'As fotografias mantêm-se. Escolha um cliente em cada um.' }),
      el('div', { class: 'albuns-cliente' }, soltos.map((album) => linhaAlbum(album, manifestos[album.id])))
    ]));
  }
  const app = document.getElementById('app');
  if (ticket !== pedidoNavegacao) return;
  app.replaceChildren(el('div', { class: 'pagina' }, [
    topo(conta, 'Estúdio'),
    el('section', { class: 'intro' }, [
      el('h2', { text: 'Os clientes e os álbuns.' }),
      el('ol', { class: 'passos' }, [
        el('li', {}, [el('strong', { text: '01' }), 'Crie o cliente e, nele, um álbum para cada trabalho.']),
        el('li', {}, [el('strong', { text: '02' }), 'Abra o álbum, escreva o trabalho e largue as fotografias.']),
        el('li', {}, [el('strong', { text: '03' }), 'Copie o recado e envie-o ao cliente.']),
        el('li', {}, [el('strong', { text: '04' }), 'Quando devolverem o ficheiro, importe-o nesse álbum.'])
      ]),
      el('p', { class: 'aviso-suave', text: 'A palavra-passe separa os clientes. No plano gratuito do GitHub o site é público: serve para entregar um trabalho, não para material que tenha de ficar secreto. Clientes, palavras-passe e álbuns mudam-se aqui e ficam no site.' })
    ]),
    el('div', { class: 'acoes nao-imprimir' }, [
      botao('novo-cliente', 'Novo cliente', 'primario'),
      botao('novo-album', 'Novo álbum', 'secundario')
    ]),
    painelFormulario(),
    lista,
    blocoLigacao(false)
  ]));
  document.getElementById('painel-form')?.scrollIntoView({ block: 'start' });
  document.getElementById('form-nome')?.focus();
  document.getElementById('form-titulo')?.focus();
}

function pintarAlbunsCliente(ticket) {
  const conta = sessao();
  const lista = albunsDo(conta.utilizador, false);
  document.title = 'Álbuns — ' + CONFIG.nome;
  const app = document.getElementById('app');
  if (ticket !== pedidoNavegacao) return;
  const blocos = lista.map((album) => {
    const manifesto = estado.manifestos?.[album.id];
    const fotos = manifesto ? fotosUteis(manifesto).length : null;
    return el('article', { class: 'sala-linha' }, [
      el('div', {}, [
        el('p', { class: 'kicker', text: manifesto?.evento || album.evento || 'Álbum' }),
        el('h3', { text: tituloAlbum(album, manifesto) }),
        el('p', { class: 'sub', text: fotos == null ? 'Ainda a chegar. Atualize daqui a um minuto.' : (fotos === 0 ? 'Ainda sem fotografias' : `${fotos} ${fotos === 1 ? 'fotografia' : 'fotografias'}`) })
      ]),
      el('div', { class: 'lado' }, [
        el('a', { class: 'primario', href: '#/sala/' + album.id, text: 'Abrir' })
      ])
    ]);
  });
  app.replaceChildren(el('div', { class: 'pagina' }, [
    topo(conta, 'Os seus álbuns'),
    el('section', { class: 'intro' }, [
      el('h2', { text: lista.length ? 'Escolha o trabalho.' : 'Ainda não há álbuns.' }),
      el('p', { class: 'lede', text: lista.length
        ? 'Cada trabalho tem a sua sala. O visto, a cruz e a estrela ficam nesse álbum.'
        : 'Quando houver um álbum para si, aparece aqui. Se acabou de ser criado, espere um minuto e atualize.' })
    ]),
    lista.length ? el('div', { class: 'salas' }, blocos) : el('div', { class: 'acoes' }, [botao('atualizar', 'Atualizar', 'secundario')])
  ]));
}

function lerFormulario() {
  const root = document.querySelector('.preparar');
  const valor = (nome) => root.querySelector(`[data-campo="${nome}"]`).value.trim();
  const limite = Number(valor('limiteAlbum'));
  return {
    evento: valor('evento'),
    titulo: valor('titulo'),
    data: valor('data'),
    local: valor('local'),
    prazo: valor('prazo'),
    limiteAlbum: Number.isFinite(limite) && limite > 0 ? Math.round(limite) : 0,
    mensagem: valor('mensagem')
  };
}

function celulaFoto(foto, modo) {
  const versao = estado.manifest.atualizado || '';
  const relativa = foto.previa || foto.original;
  const img = el('img', {
    src: urlFoto(estado.galeriaId, relativa, versao),
    alt: foto.nome || 'Fotografia',
    loading: 'lazy',
    decoding: 'async'
  });
  img.addEventListener('error', () => img.closest('.foto')?.classList.add('falhou'));
  const moldura = el('button', { type: 'button', class: 'moldura', 'data-acao': 'abrir', 'data-id': foto.id, 'aria-label': 'Abrir ' + (foto.nome || 'fotografia') }, img);
  const selCliente = modo === 'votar' ? lerSelecao(estado.galeriaId) : null;
  const recebida = modo === 'recebida' ? lerRecebida(estado.galeriaId) : null;
  const marca = (selCliente || recebida || { fotos: {} }).fotos[foto.id] || {};
  const artigo = el('article', {
    class: 'foto' + (marca.voto === 'gosto' ? ' voto-gosto' : '') + (marca.voto === 'nao' ? ' voto-nao' : '') + (marca.album ? ' no-album' : ''),
    'data-foto': foto.id
  }, [
    moldura,
    el('div', { class: 'pe' }, [
      el('span', { text: numeroDe(foto) }),
      el('span', { class: 'nome', text: foto.nome || '' }),
      (marca.comentario || '').trim() ? el('span', { class: 'ponto', title: 'Tem comentário' }) : null
    ])
  ]);
  if (modo === 'votar') {
    artigo.append(el('div', { class: 'votos' }, [
      botaoIcone('votar', 'visto', 'Gosto', { 'data-voto': 'gosto', 'data-id': foto.id, 'aria-pressed': marca.voto === 'gosto' ? 'true' : 'false' }),
      botaoIcone('votar', 'cruz', 'Não gosto', { 'data-voto': 'nao', 'data-id': foto.id, 'aria-pressed': marca.voto === 'nao' ? 'true' : 'false' }),
      botaoIcone('votar', 'estrela', 'Para o álbum', { 'data-voto': 'album', 'data-id': foto.id, 'aria-pressed': marca.album ? 'true' : 'false' })
    ]));
  } else if (modo === 'recebida') {
    artigo.append(el('p', { class: 'marca-txt', text: legendaMarca(marca) }));
  } else if (modo === 'gerir') {
    artigo.append(el('div', { class: 'votos nao-imprimir' }, [
      botao('remover', 'Remover', 'texto perigo', { 'data-id': foto.id })
    ]));
  }
  return artigo;
}

function legendaMarca(marca) {
  const partes = [];
  if (marca.voto === 'gosto') partes.push('gosto');
  if (marca.voto === 'nao') partes.push('não gosto');
  if (marca.album) partes.push('álbum');
  if ((marca.comentario || '').trim()) partes.push('comentário');
  return partes.join(' · ') || 'sem marca';
}

function blocoRecebida(manifesto) {
  const recebida = lerRecebida(estado.galeriaId);
  const corpo = [
    el('h2', { text: 'Seleção do cliente' }),
    el('p', { class: 'aviso-suave', text: 'Quando lhe enviarem o ficheiro, largue-o nesta página ou escolha-o. O CSV abre no Excel em português e lista o nome de cada ficheiro.' })
  ];
  if (!recebida) {
    corpo.push(el('div', { class: 'acoes nao-imprimir' }, [
      botao('abrir-seletor', 'Importar seleção', 'secundario', { 'data-alvo': '#ficheiro-selecao' })
    ]));
    return el('section', { class: 'secção', id: 'zona-selecao' }, corpo);
  }
  const contagem = resumoDe(manifesto, recebida);
  corpo.push(el('p', { class: 'sub', text: 'Recebida ' + (recebida.recebidoEm ? dataCurta(recebida.recebidoEm) : '') }));
  corpo.push(el('div', { class: 'chips' }, [
    el('span', {}, ['Gosto ', el('strong', { text: String(contagem.gosto) })]),
    el('span', {}, ['Não gosto ', el('strong', { text: String(contagem.nao) })]),
    el('span', {}, ['Álbum ', el('strong', { text: String(contagem.album) })]),
    el('span', {}, ['Comentários ', el('strong', { text: String(contagem.comentarios) })]),
    el('span', {}, ['Por decidir ', el('strong', { text: String(contagem.pendentes) })])
  ]));
  if ((recebida.nota || '').trim()) {
    corpo.push(el('p', { class: 'etiqueta', text: 'Nota do cliente' }));
    corpo.push(el('p', { class: 'recado', text: recebida.nota.trim() }));
  }
  const comentarios = fotosUteis(manifesto).filter((foto) => (recebida.fotos[foto.id]?.comentario || '').trim());
  if (comentarios.length) {
    corpo.push(el('ul', { class: 'comentarios' }, comentarios.map((foto) => el('li', {}, [
      el('button', { type: 'button', class: 'texto', 'data-acao': 'abrir', 'data-id': foto.id, 'data-modo': 'recebida', text: numeroDe(foto) + ' · ' + (foto.nome || '') }),
      el('p', { text: recebida.fotos[foto.id].comentario.trim() })
    ]))));
  }
  corpo.push(el('div', { class: 'acoes nao-imprimir' }, [
    botao('csv', 'Descarregar CSV', 'primario'),
    botao('abrir-seletor', 'Substituir seleção', 'secundario', { 'data-alvo': '#ficheiro-selecao' }),
    botao('limpar-selecao', 'Limpar seleção', 'texto')
  ]));
  corpo.push(el('div', { class: 'grelha recebidas', id: 'grelha-recebida' }, fotosUteis(manifesto).map((foto) => celulaFoto(foto, 'recebida'))));
  return el('section', { class: 'secção', id: 'zona-selecao' }, corpo);
}

function pintarPreparar(ticket, manifesto) {
  const conta = sessao();
  const familia = contaDaGaleria(estado.galeriaId) || { nome: 'Sala', galeria: estado.galeriaId, utilizador: '', palavraPasse: '' };
  const form = aplicarRascunho(manifesto, lerRascunho(estado.galeriaId));
  document.title = (form.titulo || familia.nome) + ' — preparar';
  const fila = filaDe(estado.galeriaId);
  const app = document.getElementById('app');
  if (ticket !== pedidoNavegacao) return;
  app.replaceChildren(el('div', { class: 'pagina preparar' }, [
    topo(conta, familia.nome),
    el('p', { class: 'nao-imprimir' }, el('a', { href: '#/estudio', text: 'Todas as salas' })),
    el('section', { class: 'cabeca-sala' }, [
      el('p', { class: 'kicker', text: familia.nome }),
      el('h2', { text: form.titulo || 'Nova sala' }),
      familia.utilizador ? el('p', { class: 'credenciais', text: familia.utilizador + '  ·  ' + familia.palavraPasse }) : el('p', { class: 'sub', text: 'Este álbum ainda não tem cliente. Atribua um no estúdio para ele poder entrar.' }),
      el('div', { class: 'acoes nao-imprimir' }, [
        botao('copiar-recado', 'Copiar recado de acesso', 'secundario', { 'data-galeria': familia.galeria }),
        el('a', { class: 'texto', href: '#/sala/' + familia.galeria, text: 'Ver como o cliente' })
      ])
    ]),
    blocoLigacao(true),
    el('section', { class: 'secção' }, [
      el('h2', { text: 'O recado' }),
      el('div', { class: 'duas' }, [
        el('label', { text: 'Tipo de trabalho' }, el('input', { 'data-campo': 'evento', value: form.evento || '', maxlength: '40', placeholder: 'Casamento, sessão, retrato…' })),
        el('label', { text: 'Título' }, el('input', { 'data-campo': 'titulo', value: form.titulo || '', maxlength: '120', placeholder: 'Nome do trabalho' }))
      ]),
      el('div', { class: 'duas' }, [
        el('label', { text: 'Data' }, el('input', { 'data-campo': 'data', type: 'date', value: form.data || '' })),
        el('label', { text: 'Prazo da seleção' }, el('input', { 'data-campo': 'prazo', type: 'date', value: form.prazo || '' }))
      ]),
      el('div', { class: 'duas' }, [
        el('label', { text: 'Local' }, el('input', { 'data-campo': 'local', value: form.local || '', maxlength: '160' })),
        el('label', { text: 'Número para o álbum' }, el('input', { 'data-campo': 'limiteAlbum', type: 'number', min: '0', step: '1', value: form.limiteAlbum ?? '' }))
      ]),
      el('label', { text: 'Mensagem ao cliente' }, el('textarea', { 'data-campo': 'mensagem', rows: '5', value: form.mensagem || '' }))
    ]),
    el('section', { class: 'secção nao-imprimir' }, [
      el('h2', { text: 'Fotografias' }),
      el('p', { class: 'aviso-suave', text: 'Largue JPEG, PNG ou WebP em qualidade máxima. Pode ser uma pasta inteira. O original fica guardado; na grelha o cliente vê uma versão mais leve e, ao abrir, a fotografia completa. HEIC não serve — exporte JPEG.' }),
      el('div', { class: 'queda' }, [
        el('p', { text: 'Largue aqui as fotografias.' }),
        el('div', { class: 'acoes' }, [
          botao('abrir-seletor', 'Escolher fotografias', 'secundario', { 'data-alvo': '#ficheiro-fotos' }),
          botao('abrir-seletor', 'Escolher uma pasta', 'secundario', { 'data-alvo': '#ficheiro-pasta' })
        ])
      ]),
      el('input', { id: 'ficheiro-fotos', type: 'file', hidden: true, multiple: true, accept: 'image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp', 'data-acao': 'escolher-fotos' }),
      el('input', { id: 'ficheiro-pasta', type: 'file', hidden: true, multiple: true, webkitdirectory: true, 'data-acao': 'escolher-fotos' }),
      el('p', { id: 'fila-resumo', class: 'sub', text: '' }),
      el('p', { id: 'fila-aviso', class: 'aviso-suave', hidden: true, text: 'Este envio é pesado. Se a ligação falhar, publique outra vez: o que já entrou fica no site e o resto continua na lista.' }),
      el('ul', { class: 'fila', id: 'fila-fotos' }),
      el('div', { class: 'acoes' }, [
        botao('publicar', fila.length ? 'Publicar' : 'Publicar recado', 'primario', { disabled: estado.ocupado }),
        fila.length ? botao('limpar-fila', 'Limpar lista', 'texto') : null
      ]),
      el('p', { id: 'progresso-publicacao', class: 'progresso', 'aria-live': 'polite', text: estado.progresso || '' })
    ]),
    el('input', { id: 'ficheiro-selecao', type: 'file', hidden: true, accept: 'application/json,.json', 'data-acao': 'importar-ficheiro' }),
    blocoRecebida(manifesto),
    fotosUteis(manifesto).length ? el('section', { class: 'secção' }, [
      el('h2', { text: 'Já nesta sala' }),
      el('p', { class: 'aviso-suave', text: fotosUteis(manifesto).length + ' publicadas. Se acabou de enviar e ainda não aparecem, espere um minuto e atualize.' }),
      el('div', { class: 'acoes nao-imprimir' }, [botao('atualizar', 'Atualizar', 'texto')]),
      el('div', { class: 'grelha', id: 'grelha-gerir' }, fotosUteis(manifesto).map((foto) => celulaFoto(foto, 'gerir')))
    ]) : null
  ]));
  pintarFila();
  const pasta = document.getElementById('ficheiro-pasta');
  if (pasta) pasta.webkitdirectory = true;
}

function pintarFila() {
  const lista = document.getElementById('fila-fotos');
  if (!lista || !estado.galeriaId) return;
  const fila = filaDe(estado.galeriaId);
  lista.replaceChildren(...fila.map((item) => el('li', {}, [
    el('span', { class: 'nome', text: item.file.name }),
    el('span', { class: 'peso', text: peso(item.file.size) }),
    botao('tirar-fila', 'Tirar', 'texto', { 'data-id': item.id })
  ])));
  const total = fila.reduce((soma, item) => soma + item.file.size, 0);
  const resumo = document.getElementById('fila-resumo');
  if (resumo) {
    resumo.textContent = fila.length
      ? `${fila.length} ${fila.length === 1 ? 'fotografia pronta' : 'fotografias prontas'} · ${peso(total)}`
      : 'Ainda não escolheu fotografias.';
  }
  const aviso = document.getElementById('fila-aviso');
  if (aviso) aviso.hidden = total < 200 * 1024 * 1024;
  const publicar = document.querySelector('[data-acao="publicar"]');
  if (publicar && !estado.ocupado) {
    publicar.textContent = fila.length
      ? `Publicar ${fila.length} ${fila.length === 1 ? 'fotografia' : 'fotografias'}`
      : 'Publicar recado';
  }
}

function sincronizarCelula(id) {
  const celula = document.querySelector(`.sala-cliente [data-foto="${id}"]`);
  if (!celula) return;
  const marca = lerSelecao(estado.galeriaId).fotos[id] || {};
  celula.classList.toggle('voto-gosto', marca.voto === 'gosto');
  celula.classList.toggle('voto-nao', marca.voto === 'nao');
  celula.classList.toggle('no-album', !!marca.album);
  celula.querySelectorAll('[data-voto]').forEach((botaoVoto) => {
    const voto = botaoVoto.dataset.voto;
    const ativo = voto === 'album' ? !!marca.album : marca.voto === voto;
    botaoVoto.setAttribute('aria-pressed', ativo ? 'true' : 'false');
  });
  const pe = celula.querySelector('.pe');
  let ponto = pe.querySelector('.ponto');
  const temNota = !!(marca.comentario || '').trim();
  if (temNota && !ponto) pe.append(el('span', { class: 'ponto', title: 'Tem comentário' }));
  if (!temNota && ponto) ponto.remove();
}

function atualizarBarra() {
  const barra = document.querySelector('.barra');
  if (!barra || !estado.manifest) return;
  const contagem = resumoDe(estado.manifest, lerSelecao(estado.galeriaId));
  const limite = Number(estado.manifest.limiteAlbum) || 0;
  barra.classList.toggle('acima', limite > 0 && contagem.album > limite);
  const mapa = {
    decididas: contagem.decididas + ' de ' + contagem.total + ' decididas',
    gosto: String(contagem.gosto),
    nao: String(contagem.nao),
    album: limite ? contagem.album + ' de ' + limite : String(contagem.album),
    pendentes: String(contagem.pendentes)
  };
  for (const [chave, valor] of Object.entries(mapa)) {
    const nodo = barra.querySelector(`[data-contador="${chave}"]`);
    if (nodo) nodo.textContent = valor;
  }
  const linha = document.querySelector('.avanco > span');
  if (linha) linha.style.width = (contagem.total ? (contagem.decididas / contagem.total) * 100 : 0) + '%';
  const extra = barra.querySelector('[data-contador="extra"]');
  if (extra) {
    if (limite && contagem.album > limite) extra.textContent = 'Passou o número sugerido para o álbum.';
    else extra.textContent = '';
  }
  FILTROS.forEach(([id, rotulo]) => {
    const botaoFiltro = document.querySelector(`[data-filtro="${id}"]`);
    if (!botaoFiltro) return;
    const n = id === 'todas' ? contagem.total : contagem[id === 'comentarios' ? 'comentarios' : id] ?? '';
    const valor = id === 'todas' ? contagem.total : id === 'gosto' ? contagem.gosto : id === 'nao' ? contagem.nao : id === 'album' ? contagem.album : id === 'pendentes' ? contagem.pendentes : contagem.comentarios;
    botaoFiltro.textContent = rotulo + ' ' + valor;
    botaoFiltro.classList.toggle('ativo', estado.filtro === id);
    botaoFiltro.setAttribute('aria-pressed', estado.filtro === id ? 'true' : 'false');
    botaoFiltro.dataset.rotulo = rotulo;
    void n;
  });
  const sel = lerSelecao(estado.galeriaId);
  const avisoEnvio = document.querySelector('[data-contador="envio"]');
  if (avisoEnvio) {
    const porEnviar = !sel.enviadoEm || (sel.atualizado && sel.atualizado > sel.enviadoEm);
    avisoEnvio.textContent = sel.enviadoEm && !porEnviar
      ? 'Seleção enviada deste aparelho. Se mudar alguma coisa, envie outra vez.'
      : 'A seleção fica guardada neste aparelho. A fotógrafa só a recebe quando a enviar.';
  }
}

function pintarGrelha() {
  const grelha = document.querySelector('.sala-cliente .grelha');
  if (!grelha) return;
  const fotos = fotosVisiveis();
  if (!fotos.length) {
    grelha.replaceChildren(el('p', { class: 'vazio-filtro', text: 'Nada neste filtro.' }));
  } else {
    grelha.replaceChildren(...fotos.map((foto) => celulaFoto(foto, 'votar')));
  }
  atualizarBarra();
}

function pintarSala(ticket, manifesto, modo) {
  const conta = sessao();
  const familia = contaDaGaleria(estado.galeriaId) || { nome: 'Sala', galeria: estado.galeriaId, utilizador: '', palavraPasse: '' };
  document.title = (manifesto.titulo || familia.nome) + ' — ' + CONFIG.nome;
  const fotos = fotosUteis(manifesto);
  const meta = [dataLonga(manifesto.data), manifesto.local].filter(Boolean).join(' · ');
  const app = document.getElementById('app');
  if (ticket !== pedidoNavegacao) return;
  const miolos = [
    topo(conta, familia.nome),
    modo === 'votar' && albunsDo(conta.utilizador, false).length > 1
      ? el('p', { class: 'nao-imprimir' }, el('a', { href: '#/albuns', text: 'Os meus álbuns' }))
      : null,
    modo === 'ver' ? el('p', { class: 'aviso-suave nao-imprimir', text: 'Está a ver a sala como o cliente a vê, sem a seleção. As marcas que lhe enviarem ficam na preparação.' }) : null,
    modo === 'ver' ? el('p', { class: 'nao-imprimir' }, el('a', { href: '#/estudio/' + estado.galeriaId, text: 'Voltar à preparação' })) : null,
    el('section', { class: 'cabeca-sala' }, [
      el('p', { class: 'kicker', text: [manifesto.evento, familia.nome].filter(Boolean).join(' · ') }),
      el('h2', { text: manifesto.titulo || familia.nome }),
      meta ? el('p', { class: 'meta-linha', text: meta }) : null,
      manifesto.mensagem ? el('p', { class: 'recado', text: manifesto.mensagem }) : null,
      manifesto.prazo ? el('p', { class: 'legenda', text: (prazoPassou(manifesto.prazo) ? 'O prazo pedido era ' : 'Peço a seleção até ') + dataLonga(manifesto.prazo) + (prazoPassou(manifesto.prazo) ? '. Ainda pode enviar.' : '.') }) : null
    ])
  ];
  if (!fotos.length) {
    miolos.push(el('section', { class: 'vazio' }, [
      el('h2', { text: 'Esta sala ainda está vazia.' }),
      el('p', { class: 'recado', text: modo === 'ver'
        ? 'Quando publicar as fotografias, o cliente passa a vê-las aqui.'
        : 'Quando as fotografias forem publicadas, aparecem aqui. Pode fechar e voltar com os mesmos dados. Se acabaram de ser enviadas, espere um minuto.' }),
      el('div', { class: 'acoes nao-imprimir' }, [botao('atualizar', 'Atualizar', 'secundario')])
    ]));
  } else if (modo === 'votar') {
    miolos.push(el('p', { class: 'legenda', text: 'Visto, gosto. Cruz, não gosto. Estrela, para o álbum. Toque na imagem para a ver em qualidade máxima e escrever um comentário.' }));
    miolos.push(el('div', { class: 'avanco', 'aria-hidden': 'true' }, el('span')));
    miolos.push(el('div', { class: 'filtros nao-imprimir', role: 'toolbar' }, FILTROS.map(([id, rotulo]) => el('button', {
      type: 'button',
      'data-acao': 'filtrar',
      'data-filtro': id,
      'aria-pressed': estado.filtro === id ? 'true' : 'false',
      text: rotulo
    }))));
    miolos.push(el('div', { class: 'grelha' }));
    miolos.push(el('section', { class: 'nota-geral' }, [
      el('label', { text: 'Nota para a fotógrafa' }, el('textarea', { id: 'nota-geral', rows: '3', maxlength: '2000', 'data-acao': 'nota-geral', value: lerSelecao(estado.galeriaId).nota || '' }))
    ]));
    miolos.push(el('div', { class: 'barra nao-imprimir' }, [
      el('p', { class: 'contagem' }, [
        el('span', { 'data-contador': 'decididas', text: '' }),
        ' · gosto ',
        el('span', { 'data-contador': 'gosto', text: '' }),
        ' · não ',
        el('span', { 'data-contador': 'nao', text: '' }),
        ' · álbum ',
        el('span', { 'data-contador': 'album', text: '' })
      ]),
      el('p', { class: 'legenda', 'data-contador': 'extra', text: '' }),
      el('p', { class: 'legenda', 'data-contador': 'envio', text: '' }),
      el('div', { class: 'acoes' }, [botao('enviar-selecao', 'Enviar seleção', 'primario')])
    ]));
  } else {
    miolos.push(el('div', { class: 'grelha grelha-ver' }, fotos.map((foto) => celulaFoto(foto, 'ver'))));
  }
  app.className = modo === 'votar' ? 'sala-cliente' : 'sala-previa';
  app.replaceChildren(el('div', { class: 'pagina' }, miolos));
  if (modo === 'votar') {
    pintarGrelha();
  }
}

function pintarErro(texto) {
  const conta = sessao();
  const app = document.getElementById('app');
  app.className = '';
  app.replaceChildren(el('div', { class: 'pagina' }, [
    conta ? topo(conta) : null,
    el('section', { class: 'vazio' }, [
      el('h2', { text: 'Não consegui abrir.' }),
      el('p', { class: 'recado', text: texto }),
      el('div', { class: 'acoes' }, [botao('atualizar', 'Tentar outra vez', 'primario')])
    ])
  ]));
}

function fecharLuz() {
  const luz = document.getElementById('luz');
  if (!luz || luz.hidden) return;
  luz.hidden = true;
  luz.replaceChildren();
  document.body.classList.remove('travado');
  estado.luzId = null;
  if (estado.luzOrigem && document.contains(estado.luzOrigem)) estado.luzOrigem.focus();
}

function abrirLuz(id, modo) {
  const foto = fotosUteis(estado.manifest).find((item) => item.id === id);
  if (!foto) return;
  estado.luzId = id;
  estado.modoLuz = modo || estado.modoLuz || 'ver';
  estado.luzOrigem = document.activeElement;
  let luz = document.getElementById('luz');
  if (!luz) {
    luz = el('div', { id: 'luz', class: 'luz', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Fotografia' });
    document.body.append(luz);
  }
  luz.hidden = false;
  document.body.classList.add('travado');
  const marca = marcaDaLuz(foto.id);
  const img = el('img', { alt: foto.nome || 'Fotografia' });
  const estadoImagem = el('p', { class: 'mudo', id: 'luz-estado', text: 'A abrir o original…' });
  const previa = urlFoto(estado.galeriaId, foto.previa || foto.original, estado.manifest.atualizado);
  const original = urlFoto(estado.galeriaId, foto.original || foto.previa, estado.manifest.atualizado);
  img.src = previa;
  if (original !== previa) {
    const cheia = new Image();
    cheia.onload = () => {
      if (estado.luzId !== foto.id) return;
      img.src = cheia.src;
      estadoImagem.textContent = medidas(foto, cheia);
    };
    cheia.onerror = () => {
      if (estado.luzId !== foto.id) return;
      estadoImagem.textContent = 'Não consegui abrir o original. Fica a prévia.';
    };
    cheia.src = original;
  } else {
    img.addEventListener('load', () => { estadoImagem.textContent = medidas(foto, img); }, { once: true });
  }
  const controlos = [botaoIcone('luz-anterior', 'esquerda', 'Anterior'), botaoIcone('luz-seguinte', 'direita', 'Seguinte')];
  if (estado.modoLuz === 'votar') {
    controlos.push(
      botaoIcone('votar', 'visto', 'Gosto', { 'data-voto': 'gosto', 'data-id': foto.id, 'aria-pressed': marca.voto === 'gosto' ? 'true' : 'false' }),
      botaoIcone('votar', 'cruz', 'Não gosto', { 'data-voto': 'nao', 'data-id': foto.id, 'aria-pressed': marca.voto === 'nao' ? 'true' : 'false' }),
      botaoIcone('votar', 'estrela', 'Para o álbum', { 'data-voto': 'album', 'data-id': foto.id, 'aria-pressed': marca.album ? 'true' : 'false' })
    );
  }
  controlos.push(botao('fechar-luz', 'Fechar', 'texto'));
  const bloco = [
    el('div', { class: 'luz-palco' }, img),
    el('div', { class: 'luz-barra' }, [
      el('p', { class: 'nome', text: numeroDe(foto) + '  ' + (foto.nome || '') }),
      estadoImagem,
      el('div', { class: 'luz-controlos' }, controlos),
      estado.modoLuz === 'votar'
        ? el('label', { text: 'Comentário' }, el('textarea', { id: 'luz-comentario', rows: '2', maxlength: '500', 'data-acao': 'comentario', 'data-id': foto.id, value: marca.comentario || '' }))
        : ((marca.comentario || '').trim() ? el('p', { class: 'recado', text: marca.comentario.trim() }) : null),
      estado.modoLuz === 'votar' ? el('p', { class: 'atalhos', text: 'Setas para mudar · G gosto · N não · A álbum · Esc fechar' }) : null
    ])
  ];
  luz.replaceChildren(...bloco.filter(Boolean));
  luz.querySelector('[data-acao="fechar-luz"]').focus();
}

function medidas(foto, img) {
  const w = foto.largura || img?.naturalWidth || 0;
  const h = foto.altura || img?.naturalHeight || 0;
  const partes = [];
  if (w && h) partes.push(w + ' × ' + h);
  if (foto.bytes) partes.push(peso(foto.bytes));
  partes.push('original');
  return partes.join(' · ');
}

function marcaDaLuz(id) {
  if (estado.modoLuz === 'recebida') return lerRecebida(estado.galeriaId)?.fotos?.[id] || {};
  if (estado.modoLuz === 'votar') return lerSelecao(estado.galeriaId).fotos[id] || {};
  return {};
}

function listaLuz() {
  if (estado.modoLuz === 'votar') return fotosVisiveis();
  return fotosUteis(estado.manifest);
}

function luzNavegar(delta) {
  const lista = listaLuz();
  const indice = lista.findIndex((foto) => foto.id === estado.luzId);
  if (indice < 0) return;
  const seguinte = lista[indice + delta];
  if (seguinte) abrirLuz(seguinte.id, estado.modoLuz);
}

function aplicarVoto(id, voto) {
  if (estado.modoLuz === 'recebida' || estado.modoLuz === 'ver') {
    if (!document.querySelector('.sala-cliente')) return;
  }
  const sel = lerSelecao(estado.galeriaId);
  const marca = entradaSelecao(sel, id);
  if (voto === 'album') {
    marca.album = !marca.album;
    if (marca.album) marca.voto = 'gosto';
  } else if (marca.voto === voto) {
    marca.voto = null;
    marca.album = false;
  } else {
    marca.voto = voto;
    if (voto === 'nao') marca.album = false;
  }
  sel.atualizado = new Date().toISOString();
  guardarSelecao(sel);
  const visiveis = fotosVisiveis();
  const celula = document.querySelector(`.sala-cliente [data-foto="${id}"]`);
  if (celula && !visiveis.some((foto) => foto.id === id)) celula.remove();
  else if (celula) sincronizarCelula(id);
  else if (document.querySelector('.sala-cliente .grelha')) pintarGrelha();
  atualizarBarra();
  if (estado.luzId === id && estado.modoLuz === 'votar') {
    document.querySelectorAll('#luz [data-voto]').forEach((botaoVoto) => {
      const tipo = botaoVoto.dataset.voto;
      const ativo = tipo === 'album' ? !!marca.album : marca.voto === tipo;
      botaoVoto.setAttribute('aria-pressed', ativo ? 'true' : 'false');
    });
  }
}

function adicionarFicheiros(lista) {
  if (!estado.galeriaId) return;
  const fila = filaDe(estado.galeriaId);
  const recusados = [];
  let heic = 0;
  let adicionados = 0;
  for (const file of lista) {
    const nome = (file.name || '').toLowerCase();
    const tipo = (file.type || '').toLowerCase();
    if (nome.endsWith('.heic') || nome.endsWith('.heif') || tipo.includes('heic') || tipo.includes('heif')) {
      heic += 1;
      continue;
    }
    const imagem = ['image/jpeg', 'image/png', 'image/webp'].includes(tipo) || /\.(jpe?g|png|webp)$/i.test(file.name || '');
    if (!imagem) {
      if (!nome.endsWith('.json')) recusados.push(file.name);
      continue;
    }
    if (file.size > 90 * 1024 * 1024) {
      recusados.push(file.name + ' (passa de 90 MB)');
      continue;
    }
    if (!file.size) continue;
    const repetido = fila.some((item) => item.file.name === file.name && item.file.size === file.size && item.file.lastModified === file.lastModified);
    if (repetido) continue;
    fila.push({ id: novoId(), file });
    adicionados += 1;
  }
  pintarFila();
  if (heic) toast('O HEIC não abre na sala do cliente. Exporte JPEG em qualidade máxima.');
  else if (recusados.length) toast('Ficaram de fora: ' + recusados.slice(0, 3).join(', '));
  else if (!adicionados && lista.length) toast('Não encontrei fotografias JPEG, PNG ou WebP.');
}

function normalizarSelecaoImportada(obj, galeriaId) {
  if (!obj || typeof obj !== 'object') throw new Error('Esse ficheiro não é uma seleção.');
  if (obj.tipo && obj.tipo !== 'selecao-catarina') throw new Error('Esse ficheiro não é uma seleção desta sala.');
  if (obj.galeria && obj.galeria !== galeriaId) throw new Error('Esta seleção é de outra sala.');
  const fotos = {};
  for (const [id, valor] of Object.entries(obj.fotos || {})) {
    if (!/^[\w-]+$/.test(id) || !valor || typeof valor !== 'object') continue;
    fotos[id] = {
      voto: valor.voto === 'gosto' || valor.voto === 'nao' ? valor.voto : null,
      album: !!valor.album,
      comentario: String(valor.comentario || '').slice(0, 500)
    };
  }
  return {
    tipo: 'selecao-catarina',
    versao: 1,
    galeria: galeriaId,
    nota: String(obj.nota || '').slice(0, 2000),
    enviadoEm: obj.enviadoEm || null,
    recebidoEm: new Date().toISOString(),
    familia: String(obj.familia || ''),
    titulo: String(obj.titulo || ''),
    fotos
  };
}

async function importarFicheiro(file) {
  if (!file || !estado.galeriaId) return;
  let obj;
  try { obj = JSON.parse(await file.text()); }
  catch { toast('Não consegui ler esse ficheiro.'); return; }
  try {
    const sel = normalizarSelecaoImportada(obj, estado.galeriaId);
    localStorage.setItem('cc-recebida-' + estado.galeriaId, JSON.stringify(sel));
    toast('Seleção recebida.');
    guardarRascunhoDoFormulario();
    navegar();
  } catch (erro) {
    toast(erro.message);
  }
}

function exportarObjeto() {
  const sel = lerSelecao(estado.galeriaId);
  const familia = contaDaGaleria(estado.galeriaId) || { nome: 'Sala', galeria: estado.galeriaId, utilizador: '', palavraPasse: '' };
  const fotos = {};
  for (const [id, valor] of Object.entries(sel.fotos)) {
    if (!valor.voto && !valor.album && !(valor.comentario || '').trim()) continue;
    fotos[id] = {
      voto: valor.voto || null,
      album: !!valor.album,
      comentario: (valor.comentario || '').trim()
    };
  }
  const contagem = resumoDe(estado.manifest, { fotos });
  return {
    tipo: 'selecao-catarina',
    versao: 1,
    galeria: estado.galeriaId,
    familia: familia?.nome || '',
    titulo: estado.manifest.titulo || '',
    enviadoEm: new Date().toISOString(),
    nota: (sel.nota || '').trim(),
    resumo: contagem,
    fotos
  };
}

function textoResumo(payload) {
  const r = payload.resumo;
  const linhas = [
    `Seleção — ${payload.titulo || payload.familia}`,
    payload.familia,
    '',
    `Gosto: ${r.gosto}`,
    `Não gosto: ${r.nao}`,
    `Para o álbum: ${r.album}`,
    `Por decidir: ${r.pendentes}`,
    `Com comentário: ${r.comentarios}`
  ];
  if (payload.nota) linhas.push('', 'Nota:', payload.nota);
  const notas = fotosUteis(estado.manifest).filter((foto) => (payload.fotos[foto.id]?.comentario || '').trim());
  if (notas.length) {
    linhas.push('', 'Comentários:');
    notas.slice(0, 30).forEach((foto) => {
      linhas.push(`${numeroDe(foto)} ${foto.nome}: ${payload.fotos[foto.id].comentario.trim()}`);
    });
    if (notas.length > 30) linhas.push(`… e mais ${notas.length - 30} no ficheiro.`);
  }
  linhas.push('', 'O ficheiro em anexo importa-se no estúdio da fotógrafa.');
  return linhas.join('\n');
}

function marcarSelecaoEnviada(quando) {
  const sel = lerSelecao(estado.galeriaId);
  sel.enviadoEm = quando;
  sel.atualizado = quando;
  guardarSelecao(sel);
  atualizarBarra();
}

async function enviarSelecao() {
  const payload = exportarObjeto();
  if (!payload.resumo.decididas && !payload.resumo.comentarios && !payload.nota) {
    const ok = await pedirConfirmacao('Ainda não marcou fotografias. Enviar mesmo assim?', 'Enviar');
    if (!ok) return;
  }
  const texto = textoResumo(payload);
  const ficheiro = new File([JSON.stringify(payload, null, 2)], `selecao-${estado.galeriaId}.json`, { type: 'application/json' });
  try {
    if (navigator.canShare && navigator.canShare({ files: [ficheiro] })) {
      await navigator.share({ title: 'Seleção', text: texto, files: [ficheiro] });
      marcarSelecaoEnviada(payload.enviadoEm);
      toast('Seleção pronta a enviar.');
      return;
    }
  } catch (erro) {
    if (erro && erro.name === 'AbortError') return;
  }
  try { await navigator.clipboard.writeText(texto); }
  catch { /* a descarga chega na mesma */ }
  descarregar(ficheiro.name, ficheiro, 'application/json');
  marcarSelecaoEnviada(payload.enviadoEm);
  toast('Copiei o resumo e descarreguei o ficheiro. Pode enviá-los pelo WhatsApp.');
}

function descarregarCsv() {
  const recebida = lerRecebida(estado.galeriaId);
  if (!recebida) return;
  const linhas = [[ 'numero', 'ficheiro', 'voto', 'album', 'comentario' ].map(campoCsv).join(';')];
  fotosUteis(estado.manifest).forEach((foto, indice) => {
    const marca = recebida.fotos[foto.id] || {};
    linhas.push([
      indice + 1,
      foto.nome || '',
      marca.voto === 'gosto' ? 'gosto' : marca.voto === 'nao' ? 'nao' : '',
      marca.album ? 'sim' : '',
      marca.comentario || ''
    ].map(campoCsv).join(';'));
  });
  if ((recebida.nota || '').trim()) {
    linhas.push('');
    linhas.push([campoCsv('nota'), campoCsv(recebida.nota.trim())].join(';'));
  }
  descarregar(`selecao-${estado.galeriaId}.csv`, '\uFEFF' + linhas.join('\r\n'), 'text/csv;charset=utf-8');
}

async function aoPublicar() {
  if (estado.ocupado) return;
  const meta = lerFormulario();
  guardarRascunhoDoFormulario();
  if (!meta.titulo) {
    toast('Escreva o título do evento.');
    return;
  }
  const ficheiros = filaDe(estado.galeriaId).map((item) => item.file);
  estado.ocupado = true;
  document.querySelectorAll('.preparar button').forEach((b) => { b.disabled = true; });
  definirProgresso(ficheiros.length ? 'A preparar o envio…' : 'A publicar o recado…');
  try {
    await publicarSala(estado.galeriaId, ficheiros, meta, (lote) => {
      const enviados = new Set(lote);
      filas[estado.galeriaId] = filaDe(estado.galeriaId).filter((item) => !enviados.has(item.file));
      pintarFila();
    });
    localStorage.removeItem('cc-rascunho-' + estado.galeriaId);
    let extra = '';
    try { await gravarMetaNoCatalogo(estado.galeriaId, meta); }
    catch { extra = ' A lista do estúdio pode demorar a mostrar o título novo.'; }
    estado.ocupado = false;
    definirProgresso('');
    toast('Publicado. O cliente pode demorar um minuto a ver as fotografias novas. Depois, peça para atualizar.' + extra);
    navegar();
  } catch (erro) {
    estado.ocupado = false;
    definirProgresso('');
    toast(mensagemErro(erro));
    guardarRascunhoDoFormulario();
    navegar();
  }
}

async function guardarToken() {
  const owner = document.getElementById('campo-owner')?.value.trim() || '';
  const repo = document.getElementById('campo-repo')?.value.trim() || '';
  const branch = document.getElementById('campo-branch')?.value.trim() || '';
  const valor = document.getElementById('campo-token')?.value.trim() || '';
  if (!nomeValido(owner) || !nomeValido(repo)) {
    toast('Escreva o utilizador e o repositório do GitHub, sem espaços.');
    return;
  }
  if (branch && !nomeValido(branch)) {
    toast('O ramo só pode ter letras, números, pontos e hífenes.');
    return;
  }
  const anterior = localStorage.getItem('cc-token');
  if (valor) localStorage.setItem('cc-token', valor);
  if (!localStorage.getItem('cc-token')) {
    toast('Cole o código do GitHub.');
    return;
  }
  if (valor && !/^github_pat_|^ghp_/.test(valor)) {
    toast('Esse código não tem o formato habitual. Vou testá-lo mesmo assim.');
  }
  localStorage.setItem('cc-repo', JSON.stringify({ owner, repo, branch }));
  try {
    const info = await GITHUB.pedido(`/repos/${owner}/${repo}`);
    if (info.permissions && info.permissions.push === false) {
      throw new Error('Este código consegue ver o repositório, mas não escrever.');
    }
    localStorage.setItem('cc-ligado', JSON.stringify({ fullName: info.full_name, branch: branch || info.default_branch }));
    const campo = document.getElementById('campo-token');
    if (campo) campo.value = '';
    toast('Ligado a ' + info.full_name + '.');
    navegar();
  } catch (erro) {
    if (valor) {
      if (anterior) localStorage.setItem('cc-token', anterior);
      else localStorage.removeItem('cc-token');
    }
    toast(mensagemErro(erro));
  }
}

function receberLargados(lista) {
  const jsons = [];
  const imagens = [];
  for (const file of lista) {
    if (file.type === 'application/json' || /\.json$/i.test(file.name)) jsons.push(file);
    else imagens.push(file);
  }
  if (imagens.length) adicionarFicheiros(imagens);
  if (jsons[0]) importarFicheiro(jsons[0]);
}

function refrescarEstudio() {
  if (estado.manifestos && (location.hash === '#/estudio' || location.hash === '#/estudio/')) {
    pintarEstudio(pedidoNavegacao, estado.manifestos);
    return;
  }
  navegar();
}

async function guardarClienteDoFormulario() {
  if (estado.ocupado || estado.formulario?.tipo !== 'cliente') return;
  const form = estado.formulario;
  const nome = document.getElementById('form-nome').value.trim();
  const utilizador = document.getElementById('form-utilizador').value.trim().toLowerCase();
  const palavraPasse = document.getElementById('form-passe').value.trim();
  const nota = document.getElementById('form-nota').value.trim().slice(0, 500);
  if (nome.length < 2) { toast('Escreva o nome do cliente.'); return; }
  if (!/^[a-z0-9]{3,20}$/.test(utilizador)) { toast('O utilizador só pode ter letras minúsculas e números, entre 3 e 20.'); return; }
  if ((CONFIG.contas || []).some((conta) => conta.papel === 'fotografa' && conta.utilizador === utilizador)) {
    toast('Esse utilizador é o da fotógrafa.');
    return;
  }
  if (palavraPasse.length < 6) { toast('A palavra-passe precisa de pelo menos 6 caracteres.'); return; }
  const catalogo = clonarCatalogo();
  if (catalogo.clientes.some((conta) => conta.utilizador === utilizador && conta.utilizador !== form.original)) {
    toast('Já existe um cliente com esse utilizador.');
    return;
  }
  if (form.modo === 'novo') {
    catalogo.clientes.push({ utilizador, palavraPasse, nome, ativo: true, nota });
  } else {
    const atual = catalogo.clientes.find((conta) => conta.utilizador === form.original);
    if (!atual) { toast('Não encontrei esse cliente.'); return; }
    if (form.original !== utilizador) {
      for (const album of catalogo.albuns) {
        if (album.cliente === form.original) album.cliente = utilizador;
      }
    }
    atual.utilizador = utilizador;
    atual.nome = nome;
    atual.palavraPasse = palavraPasse;
    atual.nota = nota;
  }
  const modo = form.modo;
  estado.ocupado = true;
  try {
    await gravarCatalogo(catalogo, modo === 'novo' ? 'Novo cliente ' + utilizador : 'Atualizar cliente ' + utilizador);
    estado.formulario = null;
    estado.ocupado = false;
    toast(modo === 'novo'
      ? 'Cliente criado. Pode demorar um minuto até conseguir entrar.'
      : 'Cliente atualizado. Se mudou a palavra-passe, envie o recado outra vez.');
    refrescarEstudio();
  } catch (erro) {
    estado.ocupado = false;
    toast(mensagemErro(erro));
  }
}

async function guardarAlbumDoFormulario() {
  if (estado.ocupado || estado.formulario?.tipo !== 'album') return;
  const titulo = document.getElementById('form-titulo').value.trim();
  const evento = document.getElementById('form-evento').value.trim();
  const cliente = document.getElementById('form-cliente')?.value || '';
  if (!titulo) { toast('Escreva o nome do álbum.'); return; }
  const dono = clientes().find((conta) => conta.utilizador === cliente);
  if (!dono) { toast('Escolha o cliente deste álbum.'); return; }
  const id = idAlbum(titulo);
  const manifesto = normalizarManifest({
    id,
    titulo,
    evento,
    limiteAlbum: 0,
    mensagem: mensagemPadrao(dono.nome),
    fotos: []
  }, id);
  const catalogo = clonarCatalogo();
  catalogo.albuns.push({ id, cliente, arquivado: false, titulo, evento });
  estado.ocupado = true;
  try {
    await commitJson([
      { caminho: 'dados/estudio.json', dados: catalogo },
      { caminho: `galerias/${id}/manifest.json`, dados: manifesto }
    ], 'Novo álbum ' + titulo);
    estado.catalogo = catalogo;
    estado.formulario = null;
    estado.manifestNovo = manifesto;
    estado.ocupado = false;
    toast('Álbum criado. Já pode largar as fotografias. O cliente pode demorar um minuto a vê-lo.');
    if (location.hash !== '#/estudio/' + id) location.hash = '#/estudio/' + id;
    else navegar();
  } catch (erro) {
    estado.ocupado = false;
    toast(mensagemErro(erro));
  }
}

async function alternarCliente(utilizador, ativo) {
  if (estado.ocupado) return;
  const cliente = clientes().find((conta) => conta.utilizador === utilizador);
  if (!cliente) return;
  const ok = await pedirConfirmacao(
    ativo ? `${cliente.nome} volta a conseguir entrar.` : `${cliente.nome} deixa de conseguir entrar. Os álbuns e as fotografias ficam.`,
    ativo ? 'Reativar' : 'Desativar'
  );
  if (!ok) return;
  const catalogo = clonarCatalogo();
  const atual = catalogo.clientes.find((conta) => conta.utilizador === utilizador);
  if (!atual) return;
  atual.ativo = ativo;
  estado.ocupado = true;
  try {
    await gravarCatalogo(catalogo, (ativo ? 'Reativar ' : 'Desativar ') + utilizador);
    estado.ocupado = false;
    toast(ativo ? 'Acesso reativado.' : 'Acesso desativado.');
    refrescarEstudio();
  } catch (erro) {
    estado.ocupado = false;
    toast(mensagemErro(erro));
  }
}

async function retirarCliente(utilizador) {
  if (estado.ocupado) return;
  const cliente = clientes().find((conta) => conta.utilizador === utilizador);
  if (!cliente) return;
  const ok = await pedirConfirmacao(
    `${cliente.nome} deixa de conseguir entrar. Os álbuns ficam no estúdio, sem cliente, e as fotografias mantêm-se.`,
    'Retirar acesso'
  );
  if (!ok) return;
  const catalogo = clonarCatalogo();
  catalogo.clientes = catalogo.clientes.filter((conta) => conta.utilizador !== utilizador);
  for (const album of catalogo.albuns) {
    if (album.cliente === utilizador) album.cliente = '';
  }
  estado.ocupado = true;
  try {
    await gravarCatalogo(catalogo, 'Retirar acesso de ' + utilizador);
    estado.ocupado = false;
    toast('Acesso retirado. Os álbuns ficaram por atribuir.');
    refrescarEstudio();
  } catch (erro) {
    estado.ocupado = false;
    toast(mensagemErro(erro));
  }
}

async function alternarAlbum(id, ocultar) {
  if (estado.ocupado) return;
  const album = albumPorId(id);
  if (!album || album.arquivado === ocultar) return;
  const ok = await pedirConfirmacao(
    ocultar ? 'O cliente deixa de ver este álbum. As fotografias ficam no estúdio.' : 'O cliente volta a ver este álbum.',
    ocultar ? 'Ocultar' : 'Mostrar'
  );
  if (!ok) return;
  const catalogo = clonarCatalogo();
  const atual = catalogo.albuns.find((item) => item.id === id);
  if (!atual) return;
  atual.arquivado = ocultar;
  estado.ocupado = true;
  try {
    await gravarCatalogo(catalogo, (ocultar ? 'Ocultar ' : 'Mostrar ') + (atual.titulo || id));
    estado.ocupado = false;
    toast(ocultar ? 'Álbum oculto para o cliente.' : 'Álbum visível outra vez.');
    refrescarEstudio();
  } catch (erro) {
    estado.ocupado = false;
    toast(mensagemErro(erro));
  }
}

async function atribuirAlbum(id, utilizador) {
  if (estado.ocupado) return;
  const album = albumPorId(id);
  if (!album || album.cliente === utilizador) return;
  const nome = utilizador ? (clientes().find((conta) => conta.utilizador === utilizador)?.nome || utilizador) : 'ninguém';
  const ok = await pedirConfirmacao('Este álbum passa a ser de ' + nome + '.', 'Mudar');
  if (!ok) { refrescarEstudio(); return; }
  const catalogo = clonarCatalogo();
  const atual = catalogo.albuns.find((item) => item.id === id);
  if (!atual) return;
  atual.cliente = utilizador;
  estado.ocupado = true;
  try {
    await gravarCatalogo(catalogo, 'Atribuir álbum a ' + nome);
    estado.ocupado = false;
    toast('Álbum atribuído.');
    refrescarEstudio();
  } catch (erro) {
    estado.ocupado = false;
    toast(mensagemErro(erro));
    refrescarEstudio();
  }
}

function aoClicar(evento) {
  if (evento.target.closest('.confirma')) return;
  const alvo = evento.target.closest('[data-acao]');
  if (!alvo) return;
  const acao = alvo.dataset.acao;
  if (acao === 'sair') {
    localStorage.removeItem('cc-sessao');
    fecharLuz();
    if (location.hash !== '#/entrar') location.hash = '#/entrar';
    else pintarLogin();
    return;
  }
  if (acao === 'copiar-recado') {
    const utilizador = alvo.dataset.utilizador;
    const familia = utilizador
      ? clientes().find((conta) => conta.utilizador === utilizador)
      : contaDaGaleria(alvo.dataset.galeria || estado.galeriaId);
    if (!familia?.utilizador) {
      toast('Este álbum ainda não tem cliente.');
      return;
    }
    copiar(textoRecado(familia));
    return;
  }
  if (acao === 'novo-cliente') {
    estado.formulario = { tipo: 'cliente', modo: 'novo', nome: '', utilizador: '', palavraPasse: palavraPasseNova(), nota: '' };
    refrescarEstudio();
    return;
  }
  if (acao === 'editar-cliente') {
    const cliente = clientes().find((conta) => conta.utilizador === alvo.dataset.utilizador);
    if (!cliente) return;
    estado.formulario = {
      tipo: 'cliente',
      modo: 'editar',
      original: cliente.utilizador,
      nome: cliente.nome,
      utilizador: cliente.utilizador,
      palavraPasse: cliente.palavraPasse,
      nota: cliente.nota || ''
    };
    refrescarEstudio();
    return;
  }
  if (acao === 'novo-album') {
    if (!clientes().length) { toast('Crie primeiro um cliente.'); return; }
    estado.formulario = { tipo: 'album', cliente: alvo.dataset.utilizador || clientes()[0].utilizador, titulo: '', evento: '' };
    refrescarEstudio();
    return;
  }
  if (acao === 'cancelar-form') {
    estado.formulario = null;
    refrescarEstudio();
    return;
  }
  if (acao === 'nova-passe') {
    const campo = document.getElementById('form-passe');
    if (campo) campo.value = palavraPasseNova();
    return;
  }
  if (acao === 'guardar-cliente') { guardarClienteDoFormulario(); return; }
  if (acao === 'guardar-album') { guardarAlbumDoFormulario(); return; }
  if (acao === 'desativar-cliente') { alternarCliente(alvo.dataset.utilizador, false); return; }
  if (acao === 'reativar-cliente') { alternarCliente(alvo.dataset.utilizador, true); return; }
  if (acao === 'retirar-cliente') { retirarCliente(alvo.dataset.utilizador); return; }
  if (acao === 'ocultar-album') { alternarAlbum(alvo.dataset.id, true); return; }
  if (acao === 'mostrar-album') { alternarAlbum(alvo.dataset.id, false); return; }
  if (acao === 'guardar-token') { guardarToken(); return; }
  if (acao === 'esquecer-token') {
    localStorage.removeItem('cc-token');
    localStorage.removeItem('cc-ligado');
    toast('Código esquecido neste computador.');
    navegar();
    return;
  }
  if (acao === 'abrir-seletor') {
    document.querySelector(alvo.dataset.alvo)?.click();
    return;
  }
  if (acao === 'tirar-fila') {
    filas[estado.galeriaId] = filaDe(estado.galeriaId).filter((item) => item.id !== alvo.dataset.id);
    pintarFila();
    return;
  }
  if (acao === 'limpar-fila') {
    filas[estado.galeriaId] = [];
    pintarFila();
    return;
  }
  if (acao === 'publicar') { aoPublicar(); return; }
  if (acao === 'atualizar') { navegar(); return; }
  if (acao === 'remover') {
    const foto = fotosUteis(estado.manifest).find((item) => item.id === alvo.dataset.id);
    if (foto) removerFotoPublicada(foto);
    return;
  }
  if (acao === 'limpar-selecao') {
    pedirConfirmacao('Esquecer a seleção importada desta sala?', 'Limpar').then((ok) => {
      if (!ok) return;
      localStorage.removeItem('cc-recebida-' + estado.galeriaId);
      navegar();
    });
    return;
  }
  if (acao === 'csv') { descarregarCsv(); return; }
  if (acao === 'filtrar') {
    fecharLuz();
    estado.filtro = alvo.dataset.filtro;
    pintarGrelha();
    return;
  }
  if (acao === 'abrir') {
    const modo = alvo.dataset.modo || (alvo.closest('.recebidas') ? 'recebida' : alvo.closest('.sala-cliente') ? 'votar' : alvo.closest('#grelha-gerir') ? 'gerir' : 'ver');
    abrirLuz(alvo.dataset.id, modo === 'gerir' ? 'ver' : modo);
    return;
  }
  if (acao === 'fechar-luz') { fecharLuz(); return; }
  if (acao === 'luz-anterior') { luzNavegar(-1); return; }
  if (acao === 'luz-seguinte') { luzNavegar(1); return; }
  if (acao === 'votar') {
    aplicarVoto(alvo.dataset.id || estado.luzId, alvo.dataset.voto);
    return;
  }
  if (acao === 'enviar-selecao') { enviarSelecao(); }
}

function aoInput(evento) {
  const alvo = evento.target;
  if (alvo.dataset?.campo) guardarRascunhoDoFormulario();
  if (alvo.id === 'form-nome' && estado.formulario?.modo === 'novo') {
    const user = document.getElementById('form-utilizador');
    if (user && user.dataset.auto === '1') user.value = utilizadorLivre(alvo.value);
  }
  if (alvo.id === 'form-utilizador') alvo.dataset.auto = '0';
  if (alvo.dataset?.acao === 'nota-geral') {
    const sel = lerSelecao(estado.galeriaId);
    sel.nota = alvo.value.slice(0, 2000);
    sel.atualizado = new Date().toISOString();
    guardarSelecao(sel);
    atualizarBarra();
  }
  if (alvo.dataset?.acao === 'comentario') {
    const sel = lerSelecao(estado.galeriaId);
    const marca = entradaSelecao(sel, alvo.dataset.id);
    marca.comentario = alvo.value.slice(0, 500);
    sel.atualizado = new Date().toISOString();
    guardarSelecao(sel);
    sincronizarCelula(alvo.dataset.id);
    atualizarBarra();
  }
}

function aoMudar(evento) {
  const alvo = evento.target;
  if (alvo instanceof HTMLSelectElement && alvo.dataset.acao === 'atribuir-album') {
    atribuirAlbum(alvo.dataset.id, alvo.value);
    return;
  }
  if (!(alvo instanceof HTMLInputElement) || alvo.type !== 'file') return;
  if (alvo.dataset.acao === 'escolher-fotos') adicionarFicheiros(alvo.files);
  if (alvo.dataset.acao === 'importar-ficheiro' && alvo.files[0]) importarFicheiro(alvo.files[0]);
  alvo.value = '';
}

function aoTecla(evento) {
  if (document.querySelector('.confirma')) return;
  const luz = document.getElementById('luz');
  const aberta = luz && !luz.hidden;
  if (evento.key === 'Escape' && aberta) {
    fecharLuz();
    return;
  }
  if (!aberta || estado.modoLuz !== 'votar') {
    if (aberta && evento.key === 'ArrowRight') { evento.preventDefault(); luzNavegar(1); }
    if (aberta && evento.key === 'ArrowLeft') { evento.preventDefault(); luzNavegar(-1); }
    return;
  }
  if (evento.target.closest('textarea, input')) return;
  const mapa = { g: 'gosto', G: 'gosto', n: 'nao', N: 'nao', a: 'album', A: 'album' };
  if (mapa[evento.key]) {
    evento.preventDefault();
    aplicarVoto(estado.luzId, mapa[evento.key]);
  }
  if (evento.key === 'ArrowRight') { evento.preventDefault(); luzNavegar(1); }
  if (evento.key === 'ArrowLeft') { evento.preventDefault(); luzNavegar(-1); }
  if (evento.key === 'c' || evento.key === 'C') document.getElementById('luz-comentario')?.focus();
}

function aoSubmeter(evento) {
  const form = evento.target.closest ? evento.target.closest('[data-acao="entrar"]') : null;
  if (!form) return;
  evento.preventDefault();
  const utilizador = document.getElementById('utilizador').value.trim().toLowerCase();
  const passe = document.getElementById('palavra-passe').value.trim();
  const host = (CONFIG.contas || []).find((item) => item.papel === 'fotografa' && item.utilizador === utilizador && item.palavraPasse === passe);
  const cliente = clientes().find((item) => item.utilizador === utilizador && item.palavraPasse === passe);
  const conta = host || (cliente ? { ...cliente, papel: 'cliente' } : null);
  const erro = document.querySelector('.erro');
  if (cliente && cliente.ativo === false && !host) {
    erro.textContent = 'Este acesso está desativado.';
    document.getElementById('palavra-passe').focus();
    return;
  }
  if (!conta) {
    erro.textContent = 'Não reconheço estes dados.';
    document.getElementById('palavra-passe').focus();
    return;
  }
  localStorage.setItem('cc-sessao', JSON.stringify({ utilizador: conta.utilizador }));
  const destino = conta.papel === 'fotografa' ? '#/estudio' : destinoCliente(conta);
  if (location.hash !== destino) location.hash = destino;
  else navegar();
}

async function navegar() {
  const ticket = ++pedidoNavegacao;
  fecharLuz();
  const app = document.getElementById('app');
  app.className = '';
  if (!window.CONFIG?.contas?.length) {
    app.textContent = 'Falta a configuração.';
    return;
  }
  if (!estado.catalogo) estado.catalogo = await obterCatalogo();
  if (ticket !== pedidoNavegacao) return;
  const conta = sessao();
  const partes = (location.hash || '#/entrar').replace(/^#\/?/, '').split('/').filter(Boolean);
  const rota = partes[0] || 'entrar';
  const id = partes[1] || '';
  if (!conta) {
    if (location.hash && location.hash !== '#/entrar') location.replace('#/entrar');
    pintarLogin();
    return;
  }
  if (conta.papel === 'cliente') {
    if (rota === 'sala' && id && clientePodeVer(conta, id)) {
      estado.galeriaId = id;
      estado.modoLuz = 'votar';
      app.replaceChildren(el('p', { class: 'a-carregar pagina', text: 'A abrir a sala…' }));
      try {
        const manifesto = await carregarManifestOuVazio(id);
        if (ticket !== pedidoNavegacao) return;
        estado.manifest = manifesto;
        pintarSala(ticket, manifesto, 'votar');
      } catch {
        if (ticket === pedidoNavegacao) pintarErro('Não consegui abrir a sua sala.');
      }
      return;
    }
    const destino = destinoCliente(conta);
    if (location.hash !== destino) {
      location.replace(destino);
      return;
    }
    app.replaceChildren(el('p', { class: 'a-carregar pagina', text: 'A abrir os álbuns…' }));
    const pares = await Promise.all(albunsDo(conta.utilizador, false).map(async (album) => {
      try { return [album.id, await carregarManifest(album.id)]; }
      catch { return [album.id, null]; }
    }));
    if (ticket !== pedidoNavegacao) return;
    estado.manifestos = Object.fromEntries(pares);
    pintarAlbunsCliente(ticket);
    return;
  }
  if (rota === 'sala' && id && contaDaGaleria(id)) {
    estado.galeriaId = id;
    estado.modoLuz = 'ver';
    app.replaceChildren(el('p', { class: 'a-carregar pagina', text: 'A abrir a sala…' }));
    try {
      const manifesto = await carregarManifestOuVazio(id);
      if (ticket !== pedidoNavegacao) return;
      estado.manifest = manifesto;
      pintarSala(ticket, manifesto, 'ver');
    } catch {
      if (ticket === pedidoNavegacao) pintarErro('Não consegui abrir esta sala.');
    }
    return;
  }
  if (rota === 'estudio' && id && contaDaGaleria(id)) {
    if (estado.galeriaId !== id) estado.filtro = 'todas';
    estado.galeriaId = id;
    app.replaceChildren(el('p', { class: 'a-carregar pagina', text: 'A abrir a sala…' }));
    try {
      const manifesto = await carregarManifestOuVazio(id);
      if (ticket !== pedidoNavegacao) return;
      estado.manifest = manifesto;
      pintarPreparar(ticket, manifesto);
    } catch {
      if (ticket === pedidoNavegacao) pintarErro('Não consegui abrir esta sala.');
    }
    return;
  }
  if (location.hash !== '#/estudio') {
    location.replace('#/estudio');
    return;
  }
  app.replaceChildren(el('p', { class: 'a-carregar pagina', text: 'A abrir o estúdio…' }));
  const pares = await Promise.all(albunsVisiveis().map(async (album) => {
    try { return [album.id, await carregarManifest(album.id)]; }
    catch { return [album.id, null]; }
  }));
  if (ticket !== pedidoNavegacao) return;
  estado.manifestos = Object.fromEntries(pares);
  pintarEstudio(ticket, estado.manifestos);
}

let arrastoTimer = 0;
window.addEventListener('dragover', (evento) => {
  if (!document.querySelector('.preparar')) return;
  evento.preventDefault();
  document.querySelector('.preparar')?.classList.add('a-receber');
  clearTimeout(arrastoTimer);
  arrastoTimer = setTimeout(() => document.querySelector('.preparar')?.classList.remove('a-receber'), 180);
});
window.addEventListener('drop', (evento) => {
  const painel = document.querySelector('.preparar');
  if (!painel) return;
  evento.preventDefault();
  painel.classList.remove('a-receber');
  if (evento.dataTransfer?.files?.length) receberLargados(evento.dataTransfer.files);
});
window.addEventListener('beforeunload', (evento) => {
  if (!estado.ocupado) return;
  evento.preventDefault();
  evento.returnValue = '';
});
document.addEventListener('pointerdown', (evento) => {
  if (!evento.target.closest?.('#luz')) return;
  if (evento.target.closest('button, textarea, input, a, label')) return;
  toqueX = evento.clientX;
});
document.addEventListener('pointerup', (evento) => {
  if (toqueX == null) return;
  const dx = evento.clientX - toqueX;
  toqueX = null;
  if (Math.abs(dx) < 48) return;
  luzNavegar(dx > 0 ? -1 : 1);
});

document.body.addEventListener('click', aoClicar);
document.body.addEventListener('input', aoInput);
document.body.addEventListener('change', aoMudar);
document.body.addEventListener('submit', aoSubmeter);
document.addEventListener('keydown', aoTecla);
window.addEventListener('hashchange', () => { navegar(); });

document.title = CONFIG.nome + ' — Sala de provas';
async function arrancar() {
  estado.catalogo = await obterCatalogo();
  if (!location.hash) {
    const conta = sessao();
    location.replace(conta ? (conta.papel === 'fotografa' ? '#/estudio' : destinoCliente(conta)) : '#/entrar');
  } else {
    navegar();
  }
}
arrancar();
