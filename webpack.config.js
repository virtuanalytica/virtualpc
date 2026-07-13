const path = require('path');

module.exports = {
  mode: 'production',
  entry: './client/src/index.tsx',
  output: {
    path: path.resolve(__dirname, 'dist/public'),
    filename: 'bundle.js'
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
    alias: {
      '@': path.resolve(__dirname, 'client/src')
    }
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader']
      }
    ]
  },
  devServer: {
    static: {
      directory: path.join(__dirname, 'client')
    },
    compress: true,
    port: 3000,
    proxy: [
      {
        context: ['/api'],
        target: 'http://localhost:3100',
        pathRewrite: { '^/api': '/api' },
        changeOrigin: true
      }
    ]
  },
  optimization: {
    minimize: true
  }
};
