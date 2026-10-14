# Sala de provas — Catarina Candeias

Site estático para um cliente ver as fotografias de um trabalho, marcar com visto as que quer, com cruz as que não quer, deixar comentários e enviar a seleção.

## Publicar no GitHub Pages

1. Crie um repositório no GitHub e envie esta pasta.
2. Em **Settings → Pages**, escolha o ramo `main` e a pasta raiz (`/`).
3. Abra o endereço do site e entre com o utilizador da fotógrafa.
4. A palavra-passe da fotógrafa está em `js/config.js`. Os clientes criam-se no estúdio.

## Deixar as fotografias

1. No GitHub, abra [tokens de âmbito fino](https://github.com/settings/personal-access-tokens/new).
2. Crie um token **só para este repositório**, com permissão **Contents: leitura e escrita**.
3. Copie o token (o GitHub só o mostra uma vez) e cole-o em **Ligar o GitHub**, no estúdio. Fica apenas nesse computador, nunca no site.
4. Abra a sala do cliente, escreva o tipo de trabalho (casamento, sessão, retrato, batizado ou outro), largue os JPEG em qualidade máxima — pode ser uma pasta inteira — e publique.
5. Espere cerca de um minuto e atualize. Copie o recado de acesso e envie-o ao cliente.

O original fica guardado. Na grelha o cliente vê uma versão mais leve; ao abrir a fotografia, carrega o ficheiro completo.

## Clientes e álbuns

A conta da fotógrafa continua em `js/config.js`. Os clientes e os álbuns criam-se no estúdio, com o GitHub ligado, e ficam em `dados/estudio.json`. Assim o cliente consegue entrar noutro aparelho.

No estúdio pode criar clientes, mudar o nome e a palavra-passe, deixar uma nota que só ela vê, desativar ou retirar o acesso, criar vários álbuns para o mesmo cliente, ocultar um álbum e passá-lo a outro cliente. Retirar o acesso não apaga as fotografias.

O estúdio começa vazio. Os clientes e os álbuns criam-se lá.

## Quando o cliente responde

A seleção fica no aparelho deles até carregarem em **Enviar seleção** (WhatsApp, se o telemóvel deixar, ou um ficheiro). No estúdio, largue esse ficheiro na sala certa. Pode descarregar um CSV — separado por ponto e vírgula — para cruzar os nomes dos ficheiros no Lightroom.

## Limite a ter em conta

No plano gratuito o site é público. A palavra-passe impede uma visita casual e separa os clientes, mas quem abrir o repositório no GitHub consegue ver os ficheiros. Use isto para entregar um trabalho, não para material que tenha de ficar secreto.

Ficheiros muito grandes: cada fotografia tem de ficar abaixo de 90 MB. Se o envio for enorme e a ligação cair, publique outra vez — o que já entrou permanece e o resto continua na lista.
