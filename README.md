# Traza MVP

Plataforma web (Next.js) para correr en **localhost:3000**.

## Requisitos

- **Node.js**: `>= 18.18.0` (ver `.nvmrc`)
- **npm** (incluido con Node)

### Si no tenés `node` / `npm` instalado (Windows)

Opciones recomendadas:

- **Installer oficial de Node.js (LTS)**: instalá Node 18+ desde la web de Node y reabrí la terminal.
- **winget** (si lo tenés): 

```bash
winget install OpenJS.NodeJS.LTS
```

Chequeo rápido:

```bash
node -v
npm -v
```

## Levantar en local (modo desarrollo)

En PowerShell, dentro de la carpeta del proyecto:

```bash
npm install
npm run dev
```

Abrí `http://localhost:3000`.

## Levantar en local (modo “producción”)

```bash
npm install
npm run build
npm run start
```

Abrí `http://localhost:3000`.

## Troubleshooting

### `npm` no se reconoce (pero `node` sí)

Esto suele pasar cuando Node se instaló sin el bundle de npm o el PATH quedó incompleto.

- Reinstalá Node usando el **installer oficial** (asegurate de tildar la opción de instalar npm), o con `winget`:

```bash
winget install OpenJS.NodeJS.LTS
```

- Cerrá y reabrí la terminal y verificá:

```bash
node -v
npm -v
```

### El puerto 3000 está ocupado

- Cerrá el proceso que lo esté usando, o liberalo y volvé a ejecutar `npm run dev`.
- Si necesitás cambiar el puerto, editá los scripts en `package.json` (por ejemplo `-p 3001`).

### Problemas de versión de Node

- Asegurate de estar usando una versión compatible con `.nvmrc` (por ejemplo con NVM for Windows).

