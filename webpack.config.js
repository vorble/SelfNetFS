const path = require('path');

module.exports = {
  entry: './browser/index.ts',
  devtool: 'source-map',
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: 'ts-loader',
        exclude: [
          /node_modules/,
          /\/server\//,
        ],
      },
    ],
  },
  resolve: {
    extensions: ['.ts', '.js'],
  },
  output: {
    filename: 'selfnetfs.js',
    library: 'SNFS',
    libraryTarget: 'umd',
    path: path.resolve(__dirname, 'dist'),
  },
};
