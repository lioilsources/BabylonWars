import tseslint from 'typescript-eslint';

// Hranice vrstev: sim/, voxel/ a gen/ běží headless (testy, worker, později server)
const pureBoundary = {
  'no-restricted-imports': ['error', {
    patterns: [
      { group: ['@babylonjs/*'], message: 'sim/, voxel/ a gen/ nesmí záviset na Babylonu.' },
      { group: ['**/game/*', '**/game/**'], message: 'sim/, voxel/ a gen/ nesmí importovat game/.' },
    ],
  }],
  'no-restricted-globals': ['error', 'document', 'window'],
};

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'public/**'] },
  ...tseslint.configs.recommended,
  { files: ['src/sim/**', 'src/voxel/**', 'src/gen/**'], rules: pureBoundary },
  {
    files: ['src/sim/**'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['@babylonjs/*'], message: 'sim/ nesmí záviset na Babylonu.' },
          { group: ['**/game/*', '**/game/**', '**/voxel/mesher*'], message: 'sim/ nesmí importovat game/ ani render.' },
        ],
      }],
    },
  },
);
