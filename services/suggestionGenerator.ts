
const adjectives = [
    'cosmic', 'gritty', 'lush', 'decaying', 'neon-drenched', 'frozen', 'floating', 'ancient', 'sentient',
    'crystalline', 'radioactive', 'underwater', 'steam-powered', 'volcanic', 'dreamlike', 'monolithic',
    'overgrown', 'shadow-infested', 'golden', 'hollow', 'cybernetic', 'eldritch', 'mechanical', 'spectral',
    'verdant', 'desolate', 'opulent', 'decayed', 'eternal', 'fractal', 'pulsating', 'astral', 'obsidian',
    'forgotten', 'forbidden', 'infinite', 'microscopic', 'primordial', 'ruined', 'shimmering'
];

const classes = [
    'detective', 'mage', 'scavenger', 'knight', 'bio-hacker', 'priest', 'mercenary', 'scholar', 'pilot',
    'druid', 'monk', 'engineer', 'assassin', 'bard', 'merchant', 'chronomancer', 'necro-technician',
    'spacer', 'gladiator', 'rogue', 'alchemist', 'bounty hunter', 'diplomat', 'exorcist', 'inquisitor',
    'navigator', 'oracle', 'paladin', 'ranger', 'technomancer', 'warden', 'warlock', 'witch', 'samurai',
    'cyber-samurai', 'void-walker', 'dream-weaver', 'star-sailor', 'runesmith', 'beast-master'
];

const settings = [
    'Neo-Tokyo', 'a dying nebula', 'an orbital prison', 'a subterranean jungle', 'a Victorian cloud-city',
    'the belly of a leviathan', 'a desert of glass', 'a clockwork fortress', 'a sentient library',
    'a lunar colony', 'the ruins of Atlantis', 'a digital afterlife', 'a parasitic planet',
    'a canyon of whispering bones', 'a sky-ocean', 'a mega-mall at the end of time', 'the edge of a black hole',
    'a hive-world', 'a floating monastery', 'a gravity-defying archipelago', 'a world made of circuitry',
    'a prehistoric asteroid', 'a valley of giant mushrooms', 'a city inside a giant robot',
    'a labyrinthine salt mine', 'a forest of giant crystals', 'a frozen ocean on Europa',
    'a steam-punk London', 'a Mars colony in revolt', 'a haunted space station'
];

const goals = [
    'a lost memory', 'the spark of creation', 'a cure for a planet-wide plague', 'revenge against a god',
    'the key to the multiverse', 'the last remaining seed', 'a way home', 'the hidden treasure of a dead star',
    'a forbidden spell', 'a legendary artifact', 'a missing sibling', 'the truth behind the Veil',
    'an audience with the Emperor', 'the ultimate weapon', 'a way to stop time', 'the source of the corruption',
    'a mythical beast', 'a sunken city', 'the heart of the machine', 'a lost starship'
];

const backgrounds = [
    'from a noble house', 'raised by wolves', 'who escaped a slave camp', 'with a mysterious tattoo',
    'seeking redemption', 'haunted by ghosts', 'trained in secret', 'who possesses a cursed item',
    'burdened by debt', 'with a photographic memory', 'born under a blood moon', 'who can see the future',
    'who survived a catastrophe', 'carrying a secret message', 'exiled from their homeland'
];

const weirdFacts = [
    'gravity is optional', 'time flows backwards', 'the sun is a giant eye', 'everything is made of candy',
    'magic requires sacrifice', 'dreams manifest as reality', 'the sky is a mirror', 'people communicate via smell',
    'the trees walk', 'shadows have their own lives', 'the earth is hollow', 'nothing ever dies',
    'sound can be seen', 'colors are poisonous', 'memory is currency'
];

const creatures = [
    'mechanical dragons', 'sentient clouds', 'space whales', 'clockwork spiders', 'ghostly wolves',
    'crystalline giants', 'floating jellyfish', 'shadow beasts', 'hyper-intelligent apes', 'star-children',
    'lava eels', 'void-raptors', 'bio-luminescent insects', 'ancient golems', 'telepathic spores'
];

const dangers = [
    'a spreading void', 'a rogue AI', 'an ancient curse', 'a planetary collision', 'a civil war',
    'a swarm of nanobots', 'a cosmic entity', 'a reality-warping virus', 'a solar storm', 'a cult of doom',
    'a legendary beast', 'a tyrannical overlord', 'a temporal rift', 'a toxic atmosphere', 'a localized gravity collapse'
];

const names = [
    'Aethelgard', 'Neo-Prime', 'The Iron Reach', 'Zion-9', 'Othos', 'Xylos', 'The Glimmer', 'Nova Terra',
    'Elysium', 'The Silent Maw', 'Void-Station Delta', 'Kaldwin’s Peak', 'The Verdant Core', 'Obsidia',
    'Aetheria', 'Solstice', 'The Rust Wastes', 'Chronos', 'The Azure Coast', 'Titan’s Cradle'
];

function getRandom(arr: string[]): string {
    return arr[Math.floor(Math.random() * arr.length)];
}

export class SuggestionGenerator {
    static generateSinglePlayer(): string[] {
        const suggestions: string[] = [];
        const templates = [
            () => `A ${getRandom(adjectives)} ${getRandom(classes)} in ${getRandom(settings)} seeking ${getRandom(goals)}.`,
            () => `You are a ${getRandom(classes)} ${getRandom(backgrounds)} exploring ${getRandom(settings)}.`,
            () => `Start as a ${getRandom(classes)} in ${getRandom(settings)} where ${getRandom(weirdFacts)}.`,
            () => `A ${getRandom(adjectives)} journey of a ${getRandom(classes)} trying to find ${getRandom(goals)} in ${getRandom(settings)}.`,
            () => `As a ${getRandom(classes)}, you must survive ${getRandom(settings)} plagued by ${getRandom(dangers)}.`,
            () => `Playing a ${getRandom(classes)} who is ${getRandom(backgrounds)}, you arrive at ${getRandom(settings)}.`,
            () => `In ${getRandom(settings)}, a ${getRandom(classes)} seeks ${getRandom(goals)}.`,
            () => `The story of a ${getRandom(adjectives)} ${getRandom(classes)} in the heart of ${getRandom(settings)}.`
        ];

        const count = 5;
        while (suggestions.length < count) {
            const template = getRandom(templates as any) as any;
            const res = template();
            if (!suggestions.includes(res)) {
                suggestions.push(res);
            }
        }
        return suggestions;
    }

    static generateMultiplayer(): string[] {
        const suggestions: string[] = [];
        const templates = [
            () => `A ${getRandom(adjectives)} world in ${getRandom(settings)} where ${getRandom(weirdFacts)}.`,
            () => `The ${getRandom(adjectives)} land of ${getRandom(names)}, home to ${getRandom(creatures)} and ${getRandom(dangers)}.`,
            () => `Exploration of ${getRandom(settings)} after ${getRandom(dangers)} changed everything.`,
            () => `A high-stakes adventure in ${getRandom(settings)} featuring ${getRandom(creatures)}.`,
            () => `Conflict in ${getRandom(names)} between ${getRandom(creatures)} and ${getRandom(creatures)}.`,
            () => `A ${getRandom(adjectives)} expedition to ${getRandom(settings)} to stop ${getRandom(dangers)}.`,
            () => `In the ${getRandom(adjectives)} ${getRandom(settings)}, ${getRandom(weirdFacts)}.`,
            () => `The legend of ${getRandom(names)}, a place where ${getRandom(creatures)} rule ${getRandom(settings)}.`
        ];

        const count = 5;
        while (suggestions.length < count) {
            const template = getRandom(templates as any) as any;
            const res = template();
            if (!suggestions.includes(res)) {
                suggestions.push(res);
            }
        }
        return suggestions;
    }
}
