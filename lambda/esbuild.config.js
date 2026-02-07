const { build } = require('esbuild');

const sharedConfig = {
  bundle: true,
  minify: true,
  sourcemap: true,
  platform: 'node',
  target: 'node20',
  external: ['aws-sdk', '@aws-sdk/*', '@aws-lambda-powertools/*'],
  loader: {
    '.html': 'text',
    '.txt': 'text',
  },
  plugins: [
    {
      name: 'exclude-heavy-deps',
      setup(build) {
        // Create stub modules for heavy dependencies
        build.onResolve({ filter: /^encoding-japanese$/ }, (args) => ({
          path: args.path,
          namespace: 'stub',
        }));

        build.onResolve({ filter: /^html-to-text$/ }, (args) => ({
          path: args.path,
          namespace: 'stub',
        }));

        // Load stub implementations
        build.onLoad({ filter: /.*/, namespace: 'stub' }, (args) => ({
          contents: 'module.exports = {};',
          loader: 'js',
        }));
      },
    },
  ],
};

async function buildLambdas() {
  try {
    // Build email handler
    await build({
      ...sharedConfig,
      entryPoints: {
        // Restore original entry point now that container issues are fixed
        index: './src/email-handler/index.ts',
      },
      outfile: 'dist/email-handler/index.js',
    });

    // Build reminder processor
    await build({
      ...sharedConfig,
      entryPoints: ['src/reminder-processor/index.ts'],
      outfile: 'dist/reminder-processor/index.js',
    });

    console.log('✅ All Lambda functions built successfully');
  } catch (error) {
    console.error('❌ Build failed:', error);
    process.exit(1);
  }
}

buildLambdas();
