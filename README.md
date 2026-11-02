# Tirada

Lanzador de dados 3D para la web: física real horneada en Blender, resultados justos y sin anuncios.

## Cómo funciona

1. **Blender** (`blender/`) modela el dado y la bandeja, simula lanzamientos con cuerpos rígidos y los hornea.
2. **La web** decide el resultado con `crypto.getRandomValues` y elige una toma horneada.
3. **La simetría del cubo** gira el dado sobre sí mismo para que la cara sorteada quede arriba. La silueta no
   cambia, así que la física sigue siendo correcta: la animación muestra el resultado, nunca lo decide.

## Desarrollo

```sh
npm install
npm run dev
npm test        # justicia del dado y poses de todas las tomas
```

## Regenerar los assets 3D

Requiere Blender 5.2 en el `PATH`. El resultado se versiona en `public/models`, así que Vercel no necesita Blender.

```sh
sh blender/build_all.sh
```

| Archivo | Qué hace |
| --- | --- |
| `blender/common.py` | Geometría del dado y la bandeja, materiales, horneado del fieltro |
| `blender/build_assets.py` | Exporta `public/models/scene.glb` |
| `blender/bake_throws.py` | Simula y valida lanzamientos: `throws.bin` y `throws.json` |
| `blender/render_stills.py` | Póster, icono e imagen social en Cycles |
| `blender/inspect_throws.mjs` | Audita las tomas horneadas |

Si cambias la cámara en `src/lib/engine.ts`, cambia también la del póster en `render_stills.py`.
