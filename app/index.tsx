import React, { useEffect, useCallback, useRef } from 'react';
import { View, StyleSheet, useColorScheme } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    runOnJS,
    withSpring,
    useAnimatedReaction,
    interpolate,
    Extrapolation,
    interpolateColor,
    withRepeat,
    withTiming
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

const FONT_SIZE = 120;
const ITEM_HEIGHT = 120; // Explicit height for digits
const MIN_COUNT = 2;
const MAX_COUNT = 24;
const SWIPE_FRICTION = 0.45;

const SPRING_CONFIG = {
    mass: 0.8,
    stiffness: 180,
    damping: 25,
};

const numbers = Array.from({ length: MAX_COUNT - MIN_COUNT + 1 }, (_, i) => MIN_COUNT + i);

const OdometerItem = React.memo(({ index, value, scrollY, idleProgress, colors }: any) => {
    const itemPositionY = index * ITEM_HEIGHT;

    const style = useAnimatedStyle(() => {
        const distance = Math.abs(scrollY.value - itemPositionY);

        const opacity = interpolate(
            distance,
            [0, ITEM_HEIGHT, ITEM_HEIGHT * 2],
            [1, 0.3, 0],
            Extrapolation.CLAMP
        );

        const baseColor = interpolateColor(
            distance,
            [0, ITEM_HEIGHT, ITEM_HEIGHT * 2],
            [colors.textCenter, colors.textSub, colors.textSub]
        );

        const ultimateColor = interpolateColor(
            idleProgress.value,
            [0, 1],
            [baseColor, colors.textSub]
        );

        return {
            opacity,
            color: ultimateColor
        };
    }, [colors]);

    return (
        <Animated.View style={styles.item}>
            <Animated.Text style={[styles.text, style]}>
                {value}
            </Animated.Text>
        </Animated.View>
    );
});

function HomeScreen() {
    // 훅의 초기값이 null일 경우 시스템 기본값으로 light를 고정
    const colorScheme = useColorScheme() ?? 'light';
    const isDark = colorScheme === 'dark';

    // Theme values definition
    const themeColors = {
        background: isDark ? '#1D1D1F' : '#FBFBFD',
        textCenter: isDark ? '#FBFBFD' : '#1D1D1F',
        textSub: isDark ? '#98989D' : '#8E8E93',
        point: isDark ? '#FF453A' : '#FF3B30'
    };

    const { count: initialCountParam } = useLocalSearchParams<{ count?: string }>();

    const startCount = initialCountParam ? parseInt(initialCountParam, 10) : MIN_COUNT;
    const initialCount = isNaN(startCount) ? MIN_COUNT : Math.min(Math.max(startCount, MIN_COUNT), MAX_COUNT);
    const startIndex = initialCount - MIN_COUNT;

    const scrollY = useSharedValue(startIndex * ITEM_HEIGHT);
    const prevScrollY = useSharedValue(startIndex * ITEM_HEIGHT);

    const lastHapticIndex = useSharedValue(startIndex);

    const idleProgress = useSharedValue(0);
    const idleTimerRaw = useRef<NodeJS.Timeout | null>(null);

    const startIdleAnim = useCallback(() => {
        idleProgress.value = withRepeat(
            withTiming(1, { duration: 1500 }),
            -1,
            true
        );
    }, [idleProgress]);

    const resetIdleTimer = useCallback(() => {
        idleProgress.value = withTiming(0, { duration: 200 });
        if (idleTimerRaw.current) {
            clearTimeout(idleTimerRaw.current);
        }
        idleTimerRaw.current = setTimeout(() => {
            startIdleAnim();
        }, 10000);
    }, [idleProgress, startIdleAnim]);

    useEffect(() => {
        resetIdleTimer();
        return () => {
            if (idleTimerRaw.current) clearTimeout(idleTimerRaw.current);
        };
    }, [resetIdleTimer]);

    const handleInteraction = useCallback(() => {
        resetIdleTimer();
    }, [resetIdleTimer]);

    const triggerSelectionHaptic = useCallback(() => {
        Haptics.selectionAsync();
    }, []);

    const handleTap = useCallback((finalScrollY: number) => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

        const finalIndex = Math.round(finalScrollY / ITEM_HEIGHT);
        const clampedIndex = Math.max(0, Math.min(finalIndex, numbers.length - 1));
        const currentCount = numbers[clampedIndex];

        // 추후 추가될 수 있는 미니게임 라우트 배열
        const GAMES = ['/game/dice'];
        const selectedGame = GAMES[Math.floor(Math.random() * GAMES.length)];

        router.push({ pathname: selectedGame as any, params: { count: currentCount.toString() } });
    }, []);

    useAnimatedReaction(
        () => Math.round(scrollY.value / ITEM_HEIGHT),
        (currentIndex, prevIndex) => {
            if (currentIndex !== prevIndex && prevIndex !== null && currentIndex !== lastHapticIndex.value) {
                if (currentIndex >= 0 && currentIndex < numbers.length) {
                    lastHapticIndex.value = currentIndex;
                    runOnJS(triggerSelectionHaptic)();
                }
            }
        }
    );

    const tap = Gesture.Tap()
        .maxDuration(250)
        .maxDistance(5)
        .onEnd(() => {
            runOnJS(handleTap)(scrollY.value);
            runOnJS(handleInteraction)();
        });

    const pan = Gesture.Pan()
        .minDistance(10)
        .onBegin(() => {
            runOnJS(handleInteraction)();
            prevScrollY.value = scrollY.value;
        })
        .onChange((event) => {
            let unboundedScrollY = prevScrollY.value - event.translationY * SWIPE_FRICTION;
            const maxScroll = (numbers.length - 1) * ITEM_HEIGHT;

            if (unboundedScrollY < 0) {
                unboundedScrollY = unboundedScrollY * 0.15;
            } else if (unboundedScrollY > maxScroll) {
                unboundedScrollY = maxScroll + (unboundedScrollY - maxScroll) * 0.15;
            }

            scrollY.value = unboundedScrollY;
        })
        .onEnd((event) => {
            // 스크롤 방향(Y축 역전)에 맞춘 속도감 있는 관성(Inertia) 적용
            const targetPosition = scrollY.value - (event.velocityY * 0.2);
            let targetIndex = Math.round(targetPosition / ITEM_HEIGHT);

            // 범위를 벗어나지 않도록 인덱스 clamp
            targetIndex = Math.max(0, Math.min(targetIndex, numbers.length - 1));

            // 가장 가까운 아이템으로 스냅
            const targetScrollY = targetIndex * ITEM_HEIGHT;
            scrollY.value = withSpring(targetScrollY, SPRING_CONFIG);
            lastHapticIndex.value = targetIndex;
            runOnJS(handleInteraction)();
        });

    const composed = Gesture.Exclusive(pan, tap);

    const listStyle = useAnimatedStyle(() => {
        return {
            transform: [{ translateY: -scrollY.value + ITEM_HEIGHT }],
        };
    });

    return (
        <GestureHandlerRootView style={[styles.root, { backgroundColor: themeColors.background }]}>
            <View style={[styles.root, { backgroundColor: themeColors.background }]}>
                <GestureDetector gesture={composed}>
                    <View style={styles.fullscreenTouchArea}>
                        <View style={styles.odometerWindow}>
                            <Animated.View style={[styles.spinnerWrapper, listStyle]}>
                                {numbers.map((val, idx) => (
                                    <OdometerItem
                                        key={val}
                                        index={idx}
                                        value={val}
                                        scrollY={scrollY}
                                        idleProgress={idleProgress}
                                        colors={themeColors}
                                    />
                                ))}
                            </Animated.View>
                        </View>
                    </View>
                </GestureDetector>
            </View>
        </GestureHandlerRootView>
    );
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
    },
    fullscreenTouchArea: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    odometerWindow: {
        height: 360,
        width: '100%',
        alignItems: 'center',
        overflow: 'hidden',
    },
    spinnerWrapper: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        alignItems: 'center',
        flexDirection: 'column',
    },
    item: {
        height: 120,
        width: '100%',
        justifyContent: 'center',
        alignItems: 'center',
    },
    text: {
        fontSize: FONT_SIZE,
        lineHeight: 120,
        fontWeight: '900',
        letterSpacing: -6,
        textAlign: 'center',
        textAlignVertical: 'center',
    },
});

export default HomeScreen;
