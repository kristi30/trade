import { ArchetypeDetails, QuizQuestion, Profile } from "./types";

export const ARCHETYPES: Record<string, ArchetypeDetails> = {
  idealist: {
    id: "idealist",
    name: "Dreamy Idealist",
    tagline: "Vulnerable hearts, starry thoughts, and deep emotional bonds.",
    description: "You experience feelings deeply and seek true, authentic emotional connection. You're guided by a warm heart and value vulnerability, poetry, and shared dreams above superficial details.",
    gradient: "from-pink-500/20 via-rose-500/10 to-purple-500/20",
    textColor: "text-rose-400",
    sparkColor: "bg-rose-500",
    traits: ["Empathetic", "Romantic", "Vulnerable", "Creative"]
  },
  adventurer: {
    id: "adventurer",
    name: "Sparkly Adventurer",
    tagline: "Spontaneous trips, midnight wanderlust, and untamed energy.",
    description: "You view life as an playground of experiences. You live for spontaneous plans, exploring hidden coffee spots, trying new cuisines, and connecting through shared thrills and laughter.",
    gradient: "from-amber-500/20 via-orange-500/10 to-rose-500/20",
    textColor: "text-orange-400",
    sparkColor: "bg-orange-500",
    traits: ["Spontaneous", "Energetic", "Curious", "Bold"]
  },
  homebody: {
    id: "homebody",
    name: "Cozy Homebody",
    tagline: "Warm blankets, slow mornings, and peaceful silence.",
    description: "You find comfort in the quiet, cozy moments of life. You appreciate the warmth of a home-cooked meal, reading side-by-side, soft jazz playlists, and relationships anchored in deep stability.",
    gradient: "from-teal-500/20 via-emerald-500/10 to-blue-500/20",
    textColor: "text-emerald-400",
    sparkColor: "bg-emerald-500",
    traits: ["Warm", "Nurturing", "Relaxed", "Grounded"]
  },
  witty: {
    id: "witty",
    name: "Playful Witty",
    tagline: "Snappy banter, friendly debates, and endless laughter.",
    description: "For you, laughter is the ultimate compatibility metric. You connect best through sharp wits, sarcasm, inside jokes, playful challenges, and someone who can comfortably tease and be teased.",
    gradient: "from-violet-500/20 via-fuchsia-500/10 to-pink-500/20",
    textColor: "text-fuchsia-400",
    sparkColor: "bg-fuchsia-500",
    traits: ["Humorous", "Banter-loving", "Quick", "Expressive"]
  },
  thinker: {
    id: "thinker",
    name: "Deep Thinker",
    tagline: "Vintage records, curious philosophies, and quiet observation.",
    description: "You connect primarily through intellect and curiosity. You love dissecting films, books, theories, and ideas over single-origin espresso or vintage vinyl records.",
    gradient: "from-blue-500/20 via-indigo-500/10 to-purple-500/20",
    textColor: "text-indigo-400",
    sparkColor: "bg-indigo-500",
    traits: ["Analytical", "Philosophical", "Independent", "Observant"]
  }
};

export const QUIZ_QUESTIONS: QuizQuestion[] = [
  {
    id: "q1",
    question: "Your dream dating location looks like...",
    options: [
      { text: "A cozy corner in an indie bookstore, sharing a hot beverage", archetype: "homebody" },
      { text: "A rooftop stargazing session talking about space and time", archetype: "idealist" },
      { text: "An impromptu road trip to an antique market or secret beach", archetype: "adventurer" },
      { text: "An arcade bar filled with vintage games and playful competition", archetype: "witty" },
      { text: "A quiet art museum or record shop, dissecting a niche exhibition", archetype: "thinker" }
    ]
  },
  {
    id: "q2",
    question: "When someone shares an important personal story with you, you...",
    options: [
      { text: "Empathize completely and hold their space with high emotional validation", archetype: "idealist" },
      { text: "Listen intently and offer constructive philosophical perspectives", archetype: "thinker" },
      { text: "Defuse deep tension with a soft, affectionate joke or warm tease", archetype: "witty" },
      { text: "Listen warmly and offer comfort, wrapping them in cozy vibes", archetype: "homebody" },
      { text: "Acknowledge it, then suggest a physical activity or walk to change the atmosphere", archetype: "adventurer" }
    ]
  },
  {
    id: "q3",
    question: "A perfect Sunday morning in your books is...",
    options: [
      { text: "Sleeping in, making slow sourdough pancakes, and listening to vinyl", archetype: "homebody" },
      { text: "Waking up early for a mountain run or exploring a new farmer's market", archetype: "adventurer" },
      { text: "Journaling thoughts, planning life goals, and sipping pour-over coffee", archetype: "thinker" },
      { text: "Answering funny group chat messages and sharing memes in bed", archetype: "witty" },
      { text: "Writing down poetry or dreaming up creative projects under the sheets", archetype: "idealist" }
    ]
  },
  {
    id: "q4",
    question: "Your ideal conversational frequency is...",
    options: [
      { text: "Dueling with playful banter, quick-witted jokes, and heavy sarcasm", archetype: "witty" },
      { text: "Diving into complex art, science, movies, or existential philosophies", archetype: "thinker" },
      { text: "Exchanging deeply vulnerable stories, emotional realities, and future dreams", archetype: "idealist" },
      { text: "Swapping stories of travel, wild life experiences, and exciting plans", archetype: "adventurer" },
      { text: "Comfortable silences, gentle check-ins, and soft daily updates", archetype: "homebody" }
    ]
  },
  {
    id: "q5",
    question: "If your life was a movie, its visual and story style would be...",
    options: [
      { text: "A warm, comforting indie drama with a gorgeous acoustic soundtrack", archetype: "homebody" },
      { text: "A fast-paced road trip film full of unexpected plot twists", archetype: "adventurer" },
      { text: "A thoughtful, visually stunning intellectual mystery with quiet pauses", archetype: "thinker" },
      { text: "A charming romantic comedy featuring rapid, snappy dialogue", archetype: "witty" },
      { text: "A magical-realist poetic journey centering around deep human bonds", archetype: "idealist" }
    ]
  },
  {
    id: "q6",
    question: "How do you prefer to resolve differences in relationships?",
    options: [
      { text: "Taking individual space to write down, analyze, and process my thoughts first", archetype: "thinker" },
      { text: "Addressing feelings immediately with deep empathy and open hearts", archetype: "idealist" },
      { text: "Using light-hearted humor to soften the mood, then resolving it together", archetype: "witty" },
      { text: "Talking quietly over tea in a cozy environment, prioritizing stability", archetype: "homebody" },
      { text: "Going for a run or drive together, shifting environments to clear our heads", archetype: "adventurer" }
    ]
  },
  {
    id: "q7",
    question: "What's your primary way of showing affection?",
    options: [
      { text: "Verbal affirmations—writing letters or articulating precisely how much you matter", archetype: "idealist" },
      { text: "Quality time—undivided attention, reading side-by-side, or cozy cooking", archetype: "homebody" },
      { text: "Thoughtful acts—making coffee exactly how you like it or curating playlists", archetype: "thinker" },
      { text: "Playful teasing and light touches—creating inside jokes and banter", archetype: "witty" },
      { text: "Spontaneous surprises—booking a random workshop or taking you to a secret spot", archetype: "adventurer" }
    ]
  },
  {
    id: "q8",
    question: "Choose a favorite vibe or theme...",
    options: [
      { text: "Soft hoodies, evening strolls, and sharing wireless headphones", archetype: "homebody" },
      { text: "Live gigs, street tacos, neon signs, and cold beers", archetype: "adventurer" },
      { text: "Vintage record players, film cameras, dark espresso, and cozy library smells", archetype: "thinker" },
      { text: "Stand-up comedy clubs, heated board game nights, and bright laughter", archetype: "witty" },
      { text: "String lights, handwritten journals, and watching the rain from the window", archetype: "idealist" }
    ]
  }
];

export const SEED_PROFILES: Omit<Profile, "id">[] = [
  {
    name: "Maya",
    age: 26,
    gender: "female",
    lookingFor: "male",
    location: "Echo Park",
    archetype: "idealist",
    quizAnswers: {},
    bio: "Looking for late-night tea runs, vintage acoustic playlists, and someone who actually remembers the lyrics. I feel the world very deeply, and I'm tired of surface-level swiping. Tell me what is keeping you awake at night, or let's write a poem about nothing.",
    sparkPrompts: {
      "My ideal Sunday": "Sleeping under string lights, waking up slow to brew jasmine tea, and writing in my journal.",
      "A quirky habit of mine": "I talk to my pothos plants and swear they grow faster when I play them acoustic folk.",
      "What I value most": "Authenticity. I want to meet someone who isn't afraid to say what they're truly feeling."
    },
    isAI: true
  },
  {
    name: "Ethan",
    age: 29,
    gender: "male",
    lookingFor: "female",
    location: "Silver Lake",
    archetype: "thinker",
    quizAnswers: {},
    bio: "Architect and visual designer. I collect old vinyl, carry a film camera everywhere, and have a weak spot for mid-century modern furniture. Let's debate whether physical books are superior, or check out a niche photography gallery in Downtown.",
    sparkPrompts: {
      "My ideal Sunday": "Pour-over single-origin espresso, sketching at a cafe with no wifi, and cleaning my records.",
      "What makes me laugh": "Wry, deadpan sarcasm and snappy, understated witty observations.",
      "What I value most": "Quiet curiosity. Someone who is always asking 'why' and loves examining details."
    },
    isAI: true
  },
  {
    name: "Chloe",
    age: 25,
    gender: "female",
    lookingFor: "everyone",
    location: "Venice Beach",
    archetype: "adventurer",
    quizAnswers: {},
    bio: "Surf enthusiast, amateur taco critic, and constant planner of road trips. I believe life is too short to stick to the itinerary. Let's drive up the coast with no maps, find a hidden beach, and watch the waves crash. Keep up if you can!",
    sparkPrompts: {
      "My ideal Sunday": "Catching early morning waves in Malibu, followed by dynamic street tacos and a beach bonfire.",
      "What makes me laugh": "Silly, energetic bantering and spontaneous physical bloopers.",
      "A goal of mine": "To surf on every continent. Let's plan our first escape!"
    },
    isAI: true
  },
  {
    name: "Marcus",
    age: 28,
    gender: "male",
    lookingFor: "female",
    location: "West Hollywood",
    archetype: "witty",
    quizAnswers: {},
    bio: "Stand-up comedy regular, trivia team captain, and professional pasta maker. If we can't exchange sharp sarcastic banter, we might be incompatible. Looking for someone with a quick wit who can comfortably roast me and handle being roasted in return.",
    sparkPrompts: {
      "My ideal Sunday": "A highly competitive board game session at a local brewery, followed by homemade carbonara.",
      "A boundary I hold": "You can steal my clothes, but do NOT reach over and steal my french fries. Order your own!",
      "What makes me laugh": "A well-timed, witty double-entendre or absurd self-deprecating memes."
    },
    isAI: true
  },
  {
    name: "Sofia",
    age: 27,
    gender: "female",
    lookingFor: "male",
    location: "Downtown LA",
    archetype: "homebody",
    quizAnswers: {},
    bio: "Interior stylist, ceramic collector, and expert-level cozy lounge curator. I love warm lighting, hot chai, and curating slow jazz playlists. My apartment is an urban jungle, but looking for a fellow human to share rainy day vibes with.",
    sparkPrompts: {
      "My ideal Sunday": "Baking fresh cinnamon rolls, wrapping myself in a heavy blanket, and watching Studio Ghibli films.",
      "What makes me laugh": "Wholesome, heartwarming animal compilation reels.",
      "My dream date": "A cozy, dim-lit tapas bar where we can hide away from the city noise and talk for hours."
    },
    isAI: true
  },
  {
    name: "Lucas",
    age: 29,
    gender: "male",
    lookingFor: "male",
    location: "Santa Monica",
    archetype: "adventurer",
    quizAnswers: {},
    bio: "Always planning the next hiking trail, flight, or street food destination. I'm a high-energy guy who packs a light bag and loves finding the hidden treasures in every city. Let's explore the world, or at least a new night market.",
    sparkPrompts: {
      "My ideal Sunday": "A sunset ridge hike in Topanga, followed by searching out the spiciest local food stall.",
      "My love language": "Sharing street food and trading wild travel stories that sound made up.",
      "What I value most": "Fearlessness. Someone who says yes to random adventures."
    },
    isAI: true
  },
  {
    name: "Oliver",
    age: 25,
    gender: "male",
    lookingFor: "female",
    location: "Venice Beach",
    archetype: "adventurer",
    quizAnswers: {},
    bio: "Gravel cyclist, beach volleyball player, and full-time espresso enthusiast. Looking for an accomplice to wake up early, bike along the coast, and find the best croissants in the city. Sarcastic, high energy, always on the go.",
    sparkPrompts: {
      "My ideal Sunday": "Riding my bike 30 miles down the coast, jumping in the ocean, and drinking a double macchiato.",
      "A goal of mine": "To cycle across the French Alps. Let's train together!",
      "My dream date": "A casual beach volleyball game, street tacos, and watching the sunset with sand on our feet."
    },
    isAI: true
  },
  {
    name: "Aria",
    age: 28,
    gender: "female",
    lookingFor: "male",
    location: "Pasadena",
    archetype: "thinker",
    quizAnswers: {},
    bio: "Biotech researcher, classical pianist, and absolute sci-fi nerd. I spend my weekends reading under big oak trees, writing short stories, or browsing used bookstores. Tell me your favorite scientific paradox or let's discuss space exploration.",
    sparkPrompts: {
      "What I value most": "Quiet intellectual curiosity. Let's have conversations that stretch our brains.",
      "My ideal Sunday": "Playing Debussy on the piano, and reading a vintage physics paper with a warm matcha latte.",
      "What makes me laugh": "Wry, understated, dry humor and very subtle scientific puns."
    },
    isAI: true
  },
  {
    name: "Leo",
    age: 27,
    gender: "male",
    lookingFor: "female",
    location: "Silver Lake",
    archetype: "idealist",
    quizAnswers: {},
    bio: "Folk singer-songwriter and creative writer. I believe we connect best in the quiet spaces between words. Let's talk about our childhood memories, sit by a campfire, or trade acoustic covers. Looking for deep, real emotional presence.",
    sparkPrompts: {
      "My ideal Sunday": "Writing melodies in my notebook, making pour-over, and wandering through a plant nursery.",
      "My love language": "Writing letters and sharing songs that make you feel like you're in an indie film.",
      "What I value most": "Vulnerability. Someone who can sit in comfortable silence but isn't afraid of the deep conversations."
    },
    isAI: true
  },
  {
    name: "Zoe",
    age: 24,
    gender: "female",
    lookingFor: "everyone",
    location: "West Hollywood",
    archetype: "witty",
    quizAnswers: {},
    bio: "Graphic designer, amateur stand-up comic, and cold brew connoisseur. I'm 90% sarcasm and 10% iced coffee. If you can handle quick banter and aren't afraid of a friendly roast session, let's talk. We'll get along if you make me laugh first.",
    sparkPrompts: {
      "What makes me laugh": "Snappy, fast-paced sarcasm, self-deprecating humor, and absolute absurdity.",
      "A boundary I hold": "I will make fun of your music taste, but you're not allowed to be offended. It's my love language.",
      "My dream date": "An underground comedy club, getting midnight pizza, and roasting the bad acts."
    },
    isAI: true
  },
  {
    name: "Sophia",
    age: 25,
    gender: "female",
    lookingFor: "everyone",
    location: "Echo Park",
    archetype: "homebody",
    quizAnswers: {},
    bio: "Thrift store collector, pottery painter, and expert soup chef. My ideal evening is lighting too many candles, putting on some soft jazz vinyl, and reading poetry on the living room rug. Looking for a warm human to share quiet rainy days with.",
    sparkPrompts: {
      "My ideal Sunday": "Baking cardamon buns, painting in my small ceramic studio, and taking an afternoon nap.",
      "My dream date": "A hidden, dim-lit wine bar where we can share a corner booth, talk about our favorite books, and ignore our phones.",
      "A quirky habit of mine": "I only drink tea from handmade ceramic mugs. Machine-made cups just ruin the vibe!"
    },
    isAI: true
  },
  {
    name: "Julian",
    age: 30,
    gender: "male",
    lookingFor: "everyone",
    location: "Downtown LA",
    archetype: "thinker",
    quizAnswers: {},
    bio: "Film archivist and amateur jazz saxophonist. I collect vintage typewriters, movie posters, and wander around modern art museums at dusk. Let's trade book recommendations or debate our favorite film endings over craft cocktails.",
    sparkPrompts: {
      "What I value most": "A restless, creative mind. Tell me about the art or film that changed how you view the world.",
      "My dream date": "An independent theater screening of an obscure film noir, followed by long discussions at a late-night diner.",
      "A goal of mine": "To write and publish an anthology of short stories centered around urban solitude."
    },
    isAI: true
  }
];
