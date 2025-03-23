import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
// import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

// export default defineConfig({
//   plugins: [tailwindcss(), reactRouter(), tsconfigPaths()],
// });

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [tailwindcss(), reactRouter(), tsconfigPaths()],
  build: {
    sourcemap: false,
  },
});
