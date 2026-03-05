module.exports = function (api) {
    api.cache(true);
    return {
        presets: ['babel-preset-expo'],
        plugins: [
            'react-native-reanimated/plugin', // 주의: reanimated 플러그인은 반드시 배열의 맨 마지막에 와야 해!
        ],
    };
};