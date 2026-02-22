module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    ['@babel/plugin-transform-optional-chaining', { loose: true }],
    'react-native-worklets-core/plugin',
  ],
};
