const path = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = (env, argv) => {
  const isProd = argv.mode === 'production';

  return {
    entry: './src/module.ts',

    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: 'module.js',
      library: { type: 'system' },
      publicPath: '',
      clean: true,
    },

    externals: [
      function ({ request }, callback) {
        const grafanaExternals = [
          '@grafana/data',
          '@grafana/ui',
          '@grafana/runtime',
          '@grafana/schema',
          'react',
          'react-dom',
          'react/jsx-runtime',
          '@emotion/css',
          '@emotion/react',
          'lodash',
          'rxjs',
          'moment',
          'd3',
        ];
        const isExternal = grafanaExternals.some(
          (ext) => request === ext || request.startsWith(ext + '/')
        );
        if (isExternal) return callback(null, request);
        callback();
      },
    ],

    module: {
      rules: [
        {
          test: /\.js$/,
          include: /node_modules/,
          resolve: { fullySpecified: false },
        },
        {
          test: /\.[tj]sx?$/,
          use: { loader: 'ts-loader', options: { transpileOnly: true } },
          exclude: /node_modules/,
        },
        {
          test: /\.css$/,
          use: ['style-loader', 'css-loader'],
        },
        {
          test: /\.svg$/,
          type: 'asset/source',
        },
        {
          test: /\.(png|jpg|gif)$/,
          type: 'asset/inline',
        },
      ],
    },

    resolve: {
      extensions: ['.ts', '.tsx', '.js', '.jsx'],
    },

    plugins: [
      new CopyWebpackPlugin({
        patterns: [
          {
            from: 'plugin.json',
            to: '.',
            // Injeta versão única por build → Grafana usa ?_cache=<versão>
            // e o navegador SEMPRE baixa o JS novo (mata o cache).
            transform(content) {
              const json = JSON.parse(content.toString());
              const stamp = new Date()
                .toISOString()
                .replace(/[-:T]/g, '')
                .slice(0, 14); // YYYYMMDDHHMMSS
              json.info.version = `0.1.0-${stamp}`;
              json.info.updated = new Date().toISOString().slice(0, 10);
              return JSON.stringify(json, null, 2);
            },
          },
          { from: 'img', to: 'img', noErrorOnMissing: true },
        ],
      }),
    ],

    devtool: isProd ? false : 'source-map',
    optimization: { splitChunks: false },
  };
};
