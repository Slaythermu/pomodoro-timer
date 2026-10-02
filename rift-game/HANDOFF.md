# RIFTFALL — handoff para continuar em outra máquina

## Objetivo (do usuário)
Jogo estilo **The Riftbreaker** (ARPG top-down + base-building, planeta alienígena) com qualidade visual AAA em todos os elementos.
Processo exigido: um subagente por aspecto; um subagente **crítico visual rigoroso** por elemento que examina screenshots e só aprova quando estiver no nível AAA;
comparações diretas e **cegas** contra o Riftbreaker; repetir o ciclo até todos os críticos ficarem impressionados.
Registrar **cada versão em imagens** (`evolution/`) para comparar a evolução.

## Stack
Three.js (WebGL2) + Vite, tudo procedural (sem assets externos). Escolhido porque Unity/Unreal não rodavam/verificavam no container.
Rodar: `npm install && npm run dev` (abra com `?autostart=1` para pular o título; `?lowfx=1` se pesado).
Controles: WASD, mouse mira/atira, Espaço dash, 1-3 armas, B constrói, M mudo.

## Arquitetura
`src/main.js` cria o ctx e chama `init(ctx)`/`update(dt,ctx)` de cada módulo, na ordem:
terrain, lighting, fx, player, enemies, buildings, hud, audio, postfx. Cada módulo expõe API em `ctx.<nome>`.
- `world/` terreno, bioma, vegetação, água (terrain.js, texgen.js, materials.js...)
- `render/` lighting.js (céu, sol, sombras, fog, luzes pooled), postfx.js (SSAO, volumétrico, bloom, grade, FXAA)
- `entities/player*` herói (IK, 3 armas), `entities/enemies*` skitter/brute/spitter/boss + diretor de ondas
- `fx/` partículas instanciadas, decals, beams
- `buildings/` 8 estruturas, modo construção, rede de energia
- `ui/` HUD, `audio/` áudio procedural (WebAudio)
- `core/` input, eventos, spatial hash

## Ferramentas de verificação visual
- `node tools/shot.mjs out.png 120 "seed=1&autostart=1" 1600 900 [script.js]` — screenshot headless (Chromium + SwiftShader; lento).
- `npm run snapshot -- <rótulo> [w h]` — gera `evolution/vNN-rótulo/` com 7 cenas fixas e atualiza `evolution/README.md` com comparativo lado a lado.
  Em máquina com GPU real, rode com `--use-gl` padrão (edite args do chromium) para ficar rápido.
Versões: v01 baseline (stubs), v02 todos os módulos integrados.

## Estado
- Os 8 módulos construtores terminaram e estão integrados; `vite build` passa.
- **Nenhum crítico visual rodou ainda.** O v02 foi gerado mas as imagens ainda não foram revisadas/criticadas.
- Nunca medido FPS em GPU real; áudio nunca ouvido.

## Próximos passos
1. Abrir `evolution/v02-*/*.png` e rodar o jogo localmente; avaliar com olhar crítico.
2. Disparar um crítico visual por elemento (terreno, iluminação/pós-FX, herói, inimigos, VFX, construções, HUD, composição geral) com screenshots; cada um dá nota e lista de defeitos.
3. Builders corrigem defeitos → novo `npm run snapshot` → críticos reavaliam. Repetir até aprovação.
4. Comparação cega vs Riftbreaker (screenshots de referência de Riftbreaker precisam ser fornecidas pelo usuário; não há acesso/permissão para baixá-las aqui).

## Problemas conhecidos
- Terreno: ~1000+ draw calls / 3.5-5M tris por frame, geração 3-6 s no init; relva atravessa bases das construções (falta limpar foliage em `b.half`); cogumelos gigantes parecem gelatina; rochas parecem paralelepípedo/cobblestone sob sol quente.
- Herói: não está no nível AAA (textura única de placas, sem animação de morte); chama/foguete sem verificação visual.
- Iluminação: look quente/lavado; volumétricos sutis; partículas/beams não recebem fog.
- Inimigos: sombras do skitter usam pose estática; 60 fps com 300+ não testado em GPU real.
- Construções: balanceamento não testado; sem limite de alcance de construção.
- Áudio: `shoot` pode tocar duas vezes (evento + play direto do player); nomes de arma adivinhados.
