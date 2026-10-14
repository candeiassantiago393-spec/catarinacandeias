# -*- coding: utf-8 -*-
"""Programa local. Guarda neste computador e envia para o site, sem abrir o GitHub."""
import base64
import json
import os
import subprocess
import threading
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PORTA = 8765
ORIGEM = f'http://127.0.0.1:{PORTA}'
CADEADO = threading.Lock()
LIMITE = 400 * 1024 * 1024


def caminho_seguro(relativo):
    texto = str(relativo or '').replace('\\', '/').strip().lstrip('/')
    partes = [parte for parte in texto.split('/') if parte and parte != '.']
    if not partes or any(parte == '..' for parte in partes):
        raise ValueError('caminho')
    if partes[0] not in ('dados', 'galerias'):
        raise ValueError('caminho')
    destino = (ROOT.joinpath(*partes)).resolve()
    if ROOT not in destino.parents:
        raise ValueError('caminho')
    return destino, '/'.join(partes)


def git(args):
    return subprocess.run(
        ['git', *args],
        cwd=ROOT,
        capture_output=True,
        text=True,
        encoding='utf-8',
        errors='replace',
        env={**os.environ, 'GIT_TERMINAL_PROMPT': '0'},
    )


def publicar(mensagem, ficheiros, apagar):
    relatorios = []
    for item in ficheiros or []:
        destino, relativo = caminho_seguro(item.get('caminho'))
        destino.parent.mkdir(parents=True, exist_ok=True)
        if item.get('texto') is not None:
            destino.write_bytes(str(item['texto']).encode('utf-8'))
        elif item.get('base64'):
            destino.write_bytes(base64.b64decode(item['base64']))
        else:
            raise ValueError('ficheiro vazio')
        relatorios.append(relativo)
    for rel in apagar or []:
        destino, relativo = caminho_seguro(rel)
        if destino.is_file():
            destino.unlink()
        relatorios.append(relativo)
    if not relatorios:
        return
    with CADEADO:
        adicionado = git(['add', '--', *relatorios])
        if adicionado.returncode != 0:
            raise RuntimeError((adicionado.stderr or adicionado.stdout).strip() or 'Não consegui guardar.')
        diferenca = git(['diff', '--cached', '--quiet'])
        if diferenca.returncode == 0:
            return
        texto = ' '.join(str(mensagem or 'Atualizar o estúdio').split())[:180] or 'Atualizar o estúdio'
        commit = git([
            '-c', 'user.name=candeiassantiago393-spec',
            '-c', 'user.email=candeiassantiago393-spec@users.noreply.github.com',
            'commit', '-m', texto,
        ])
        if commit.returncode != 0:
            raise RuntimeError((commit.stderr or commit.stdout).strip() or 'Não consegui guardar.')
        envio = git(['push', 'origin', 'HEAD'])
        if envio.returncode != 0:
            raise RuntimeError('Ficou neste computador. Não chegou ao site.')


class Pedido(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def do_POST(self):
        if self.path.split('?', 1)[0] != '/api/guardar':
            self.responder(404, {'erro': 'Não encontrei isto.'})
            return
        origem = self.headers.get('Origin', '')
        if origem and origem != ORIGEM:
            self.responder(403, {'erro': 'Não consegui guardar.'})
            return
        try:
            tamanho = int(self.headers.get('Content-Length', '0'))
        except ValueError:
            tamanho = 0
        if tamanho <= 0 or tamanho > LIMITE:
            self.responder(413, {'erro': 'É pesado demais.'})
            return
        try:
            pedido = json.loads(self.rfile.read(tamanho).decode('utf-8'))
            publicar(pedido.get('mensagem'), pedido.get('ficheiros'), pedido.get('apagar'))
        except Exception as erro:
            texto = str(erro).strip() or 'Não consegui guardar.'
            if 'caminho' in texto or 'ficheiro' in texto:
                texto = 'Não consegui guardar.'
            self.responder(400, {'erro': texto})
            return
        self.responder(200, {'ok': True})

    def responder(self, codigo, payload):
        corpo = json.dumps(payload).encode('utf-8')
        self.send_response(codigo)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(corpo)))
        self.end_headers()
        self.wfile.write(corpo)

    def log_message(self, formato, *args):
        if args and str(args[0]).startswith('POST'):
            print(formato % args)


def main():
    try:
        servidor = ThreadingHTTPServer(('127.0.0.1', PORTA), Pedido)
    except OSError:
        webbrowser.open(ORIGEM + '/#/entrar')
        return
    threading.Timer(0.4, lambda: webbrowser.open(ORIGEM + '/#/entrar')).start()
    print('Deixa esta janela aberta.')
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == '__main__':
    main()
