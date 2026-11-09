# Blue Lock Strikers

Juego de fútbol arcade inspirado en *Blue Lock*. Elige un héroe, usa su habilidad, llena la barra de despertar y gana el partido.

## Demo

Puedes probar el juego aquí:

**https://HectoritoG.github.io/A_BlueLock_Game/**

## Características

- Dos partidos jugables con héroes y rivales desbloqueables.
- Habilidades activas, despertar, disparos cargados y tackles.
- Editor de formación con guardado por héroe y partido.
- Controles para teclado y dispositivos móviles.
- Interfaz responsive, minimapa, barra de posesión y pantallas de pausa/fin.

## Requisitos

- Node.js 20.9 o superior
- npm

## Desarrollo

```bash
npm install
npm run dev
```

Abre <http://localhost:3000>.

## Producción

```bash
npm run build
npm start
```

## Despliegue en GitHub Pages

El workflow `.github/workflows/pages.yml` publica la carpeta `public/` en GitHub Pages cada vez que se hace push a `main`. La página principal (`public/index.html`) redirige a `bluelock.html`, por lo que el juego funciona como sitio estático sin necesidad de ejecutar Next.js en el servidor.

## Controles

| Acción | Teclado | Móvil |
| --- | --- | --- |
| Mover | `WASD` / flechas | Joystick |
| Pasar | `Espacio` | Botón PASS |
| Disparar (mantener para cargar) | `Shift` | Botón SHOOT (mantener) |
| Habilidad | `E` | Botón ABILITY |
| Despertar | `R` | Botón AWAKEN |
| Tackle | `F` | Botón TACKLE |
| Cambiar héroe | `Q` | Botón SWITCH |
| Pausa | `Esc` | — |

Mantén **Shift** (o el botón SHOOT en móvil) para llenar la barra de disparo. Al soltar, el balón sale con la potencia cargada; un toque rápido produce un disparo suave.

## Formaciones

- Antes de empezar, pulsa **Editar formación** en el menú principal.
- Arrastra a tus 9 jugadores sobre tu mitad del campo.
- Puedes editar la formación de cada héroe y partido.
- Usa **Guardar** para almacenarla, **Restablecer** para volver a la formación por defecto y **Cerrar** para salir sin guardar.
- La formación se usa al empezar el partido y tras cada gol.

## Estructura

- `public/bluelock.html`: todo el juego (interfaz, motor y contenido).
- `public/characters/`: retratos de los personajes usados por el juego.
- `src/app/page.tsx`: envoltorio de Next.js que carga el juego a pantalla completa.
- `src/app/layout.tsx` y `src/app/globals.css`: layout y estilos mínimos del envoltorio.

## Partidos

- **BL vs Japón**: Isagi, Rin, Nagi, Bachira, Chigiri, Yukimiya, Kurona e Hiori.
- **Bastard München vs PXG**: Kaiser, Isagi, Ness, Kunigami, Kiyora, Yukimiya, Kurona e Hiori contra Karasu, Tokimitsu, Loki, Nanase, Charles, Zantetsu, Rin y Shidou.

## Aviso

Proyecto fan sin afiliación oficial con *Blue Lock* ni con sus creadores o editoriales. Los personajes, nombres e imágenes pertenecen a sus respectivos titulares; se usan aquí con fines de demostración y entretenimiento no comercial.

## Licencia

El código del proyecto está bajo la licencia MIT incluida en `LICENSE`. Esa licencia no cubre los personajes, nombres, imágenes ni demás material de *Blue Lock*, que pertenece a sus respectivos titulares.
