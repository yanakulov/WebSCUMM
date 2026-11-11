const audio = import.meta.glob<string>('./assets/cd/track*.mp3', { eager: true, query: '?url', import: 'default' });

export const monkeyCdTracks = new Map(Object.entries(audio).map(([path, url]) => [Number(/track(\d+)\.mp3$/.exec(path)![1]), url]));
