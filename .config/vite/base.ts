import { defineConfig } from 'vite';

const config = async () => {
  const tsconfigPaths = (await import('vite-tsconfig-paths')).default;
  return defineConfig({
    plugins: [tsconfigPaths()],
    build: {
      sourcemap: true,
    },
  });
};

export default config();
