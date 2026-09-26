// The dictionaries. Twenty words chosen to share their beginnings, then two
// hundred everyday words, then two thousand. Each list holds the one before it,
// and no word is longer than seven letters, so all three sunbursts are exactly
// seven rings wide however many words they hold.

const SMALL = ['an and ant be bee car card care cart cartoon cat do dog dot tea ten to toe top try'];

const TO_200 = [
  'a about after again air all animal apple are arm art as ask at away baby back bag ball bank bear bed bell',
  'best big bird black blue boat book box boy bread bring but by cake call can cap catch chair child city clock',
  'cold come cook cup cut day did door down draw dream drink duck each ear earth eat egg end eye face fall far',
  'farm fast fish five fly food foot for free friend from fun game garden girl give go gold good green hand',
  'happy hat have he head heart help her here hill home horse hot house how i ice idea if in is it jump just',
  'keep key king know lake land last learn left letter light like line lion little live long look love make man',
  'many map me milk moon more mother music my name near new night no not now of old on one open or our out',
  'paper park pen people play rain read red river road run say sea see sing sun the time tree walk water word',
];

const TO_2000 = [
  'able above absent accent accept account across act action active actor actual add address admire admit adopt',
  'adult advance advice affair afford afraid age agency agent ago agree ahead aim airport alarm album alert',
  'alien alike alive alley allow almond almost alone along already also alter always amazing among amount amuse',
  'anchor ancient angel anger angle angry ankle annual another answer anyone apart appeal appear applaud apply',
  'arch arctic area arena argue arise armed armor army aroma around arrange array arrest arrive arrow article',
  'artist ash aside asleep assist assume athlete atom attach attack attempt attend audio aunt author autumn',
  'avenue average avoid awake award aware awful axe badge bait bake baker balance bamboo band banner bar bare',
  'barely bark barn base basic basket batch bath battle beach beam bean beard beat beauty because become beef',
  'been before begin behind being belief believe belong below belt bench bend berry beside better between',
  'beyond bike bill bin bind birth bit bite bitter blade blame blank blanket blast blind blink block blood',
  'bloom blouse blow board body boil bold bolt bone bonus boot border boring born borrow boss both bother',
  'bottle bottom bounce bowl brace brain branch brave bravery break breath brick bride bridge brief bright',
  'broad broken bronze brother brown brush bubble bucket buddy budget bug build bulb bunch bunny burn burst',
  'bury bus bush busy butter button buy cabin cable cactus cage calm camera camp canal candle candy canoe',
  'canvas capital captain career careful carpet carrot carry case cash cashier castle cattle cause cave ceiling',
  'cell cent center central century cereal certain chain chalk chance change channel chant chapter charge chart',
  'chase cheap check cheek cheer cheese chef cherry chess chest chicken chief chimney chin chip choice choose',
  'chorus church circle citizen civil claim clap clash class claw clay clean clear clerk clever click client',
  'cliff climb close cloth cloud clover club clue coach coal coast coat coconut code coffee coin collar collect',
  'color column comb comfort comic common compare concert contain control cookie cool copy cork corn corner',
  'cost cotton couch cough could count country couple courage course court cousin cover cow crab crack craft',
  'crash crater crayon crazy cream create credit crew crime crisp crop cross crowd crown cruel crumb crush cry',
  'cube culture curious current curtain curve cushion custom cycle dad daily damage dance danger dare dark data',
  'date dawn dead deal dear death debate debt decade decide deck deep deer defeat defend degree delay deliver',
  'demand denim dentist deny depend depth desert design desire desk detail develop device dial diamond diary',
  'die diet differ dig digital dinner dip dirt dirty disease dish distant dive divide doctor dodge does dollar',
  'dolphin done donkey double doubt dove dozen drag dragon drama drawer dress drift drill drip drive drop drum',
  'dry duet dust duty eager eagle early earn ease easily east easy echo edge edit effect effort eight either',
  'elbow elder elect element elf else emerald empty endless enemy energy engine enjoy enough enter entire entry',
  'equal erase error escape essay estate even evening event ever every evil evolve exact exam example excited',
  'excuse exist exit expect expert explain extra fable fabric fact factor factory fade fail fair faith falcon',
  'false fame family famous fan fancy farmer fashion fat fate father fault favor fear feast feather feature fee',
  'feed feel fellow female fence fever few field fifteen fifty fig fight figure file fill film final find fine',
  'finger finish fire firm first fit fix flag flame flare flash flat flavor flight flip float flood floor flour',
  'flow flower fluid foam focus fog fold folk follow fond fool force forest forget fork form former fortune',
  'forty forward found four fox frame fresh fridge frog front frost frozen fruit fuel full fungus funny fur',
  'future gain galaxy gallery gap garage gas gasp gate gather gear general genius gentle gesture ghost giant',
  'gift giraffe glad glass globe glove glow glue goal goat golden golf gone goose gossip grab grade grain grand',
  'grant grape graph grass grave gravity gray great greet grid grief grill grin grip groom ground group grow',
  'guard guess guest guide guilty guitar gulf habit had hail hair half hall hammer handle hang happen harbor',
  'hard hardly harm harp harvest has hash hawk hay heal health heap hear heat heavy hedge height hello helmet',
  'hen hero hide high highway hike him hint hip hire his history hit hive hobby hold hole holiday hollow honest',
  'honey hood hook hop hope horn host hotel hour hug huge human humor hunger hungry hunt hurry hurt husband hut',
  'icicle ill image impact improve inch include income indeed index inform injury ink inner insect inside',
  'insight insist instead into invent invite iron island issue item its itself ivory jacket jaguar jam jar jaw',
  'jazz jeans jelly jewel job jog join joint joke journal journey joy judge juggle juice jungle junior jury',
  'justice keen kept kettle kick kid kidney kind kingdom kiss kitchen kite kitten knee kneel knew knife knight',
  'knit knock knot label labor ladder lady lagoon lamp lane lap large laser late later laugh lava law lawn',
  'lawyer lay layer lazy lead leader leaf lean leap least leather leave lecture leek leg legal lemon lend',
  'length lens leopard less lesson let level liberty library lid lie life lift lily limb limit link lip liquid',
  'list listen lizard loan local lock locket log logic lonely loom loose lose loss lot lotus loud lovely low',
  'lucky lunar lunch lung machine mad made magic mail main major male mall mammal manage manner maple marble',
  'march margin mark market marry mask mass master match mate math matter may maybe meal mean meat medal media',
  'medium meet melody member memory menu mercy mesh mess message metal method middle might mild mile mind mine',
  'minor mint minute mirror miss mistake mix moat mobile model modern moment money monkey month mood moose',
  'moral morning most moth motor mount mouse mouth move movie much mud mug mural museum must mustard mystery',
  'myth nail narrow nation native nature navy neat neck nectar need needle nerve nest net never news next nice',
  'nickel nine noble nobody node noise none noodle noon normal north nose note nothing notice novel number',
  'nurse nut oak oar object ocean octopus off offer office officer often oil okay olive once onion only opal',
  'opinion option orange orchard order organ origin other otter outdoor oven over owe owl own owner oxygen',
  'oyster pace pack package page pain paint pair palace pale palm pan panel panic pants parade parent part',
  'partner party pass past pasta patch path patient pattern pause pay peace peach peak pear pelican pencil',
  'pepper perfect perhaps period person pet phone photo piano pick pickle picnic picture pie piece pig pile',
  'pill pilot pin pine pink pipe pirate pitch pizza place plain plan plane planet plant plate player please',
  'plenty plot plume plus pocket poem poet point pointer pole police polite pond pool poor pop popular porch',
  'port pose post pot potato pound pour powder power praise prefer prefix present press pretty pretzel price',
  'pride prince print prison private prize problem produce profit program promise proof proper protect proud',
  'prove public pull pump pumpkin punch pupil puppy pure purple purpose purse push put puzzle pyramid quality',
  'quarter queen query quest queue quick quiet quit quite quiz quote rabbit raccoon race radio rag rail raise',
  'ranch range rank rapid rare rate rather raw reach react ready real reason recall recent recipe record reduce',
  'refuse region relax remain remedy remote remove rent repair repeat reply report rescue rest result return',
  'reveal review reward rhythm ribbon rice rich ride right rim ring rise risk rival robin robot rock role roll',
  'roof room rooster root rope rose rough round route row royal rub rubber rude rug rule ruler rumor rural rush',
  'sad safe safety saga said sail salad salary sale salt same sample sand sandal sauce sausage save saw scale',
  'scare scarf scene school science score scout scream screen search season seat seaweed second secret section',
  'secure seed seek seem select self sell send senior sense series serious serve service set settle seven',
  'severe sew shade shadow shake shall shame shape share shark sharp sheep sheet shelf shell shelter shift',
  'shine ship shirt shock shoe shoot shop shore short shot should shout show shower shrimp shut shy sick side',
  'sight sign signal silent silk silly silver simple since singer single sink siren sister sit site six size',
  'skate ski skill skin skirt sky sleep sleeve slice slide slight slip slipper slope slow small smart smell',
  'smile smoke smooth snail snake snow so soap soccer social sock soft soil soldier solid solve some son song',
  'soon sorry sort soul sound soup sour source south space spare spark speak special speech speed spell spend',
  'spice spider spin spirit split sponge spoon sport spot spray spread spring square stable stack staff stage',
  'stair stamp stand stapler star start state station stay steak steal steam steel steep stem step stick still',
  'stir stock stomach stone stop store storm story stove straw stream street stress strict strike string stripe',
  'strong student study stuff style subject success such sugar suit summer sunny supply support sure surface',
  'survive sweater sweet swim swing switch symbol system table taco tail take tale talent talk tall tank tape',
  'target tart task taste tax taxi teach teacher team tear teeth tell temple tennis tent term test text than',
  'thank that theater their them theme then there these they thick thief thin thing think third thirsty this',
  'those though thought thread three throat through throw thumb thunder ticket tide tidy tie tiger tight tile',
  'tiny tip tired title toad toast today tomato tone tongue tonight too took tool tooth topic torch total touch',
  'tough tour towel tower town toy track trade traffic trail train trap travel tray treat trend trial trick',
  'trip trout truck true trust truth tube tuna tune tunnel turkey turn turtle twelve twenty twice twin twist',
  'two type ugly ukulele uncle under unfair uniform union unique unit unless until unusual up upon upper upset',
  'urban urge us use useful user usual valley value van vanilla vast vehicle velvet version very vessel video',
  'view village vine violin virtue visa visit visitor visual vital voice volcano volume vote wage wagon waist',
  'wait wake wall wallet walnut wander want warm warmth warn was wash waste watch wave wax way we weak wealth',
  'wear weather web wedding week weigh weight weird welcome well went were west wet whale what wheat wheel when',
  'where which while whisper whistle white who whole why wide wife wild will win wind window wing winner winter',
  'wire wise wish with within without wizard wolf woman wonder wood wool work worker world worm worry worth',
  'would wrap wrist write writer wrong yak yard yarn yawn year yellow yes yet yield yolk you young your youth',
  'zebra zero zinc zip zone zoo',
];

export type Size = 20 | 200 | 2000;
export const SIZES: readonly Size[] = [20, 200, 2000];

/** The longest word in any list, and so the number of rings. */
export const MAX_LEN = 7;

const split = (lines: readonly string[]): string[] =>
  lines
    .join(' ')
    .split(' ')
    .filter(Boolean)
    .map(w => w.toUpperCase());

const W20 = split(SMALL);
const W200 = [...W20, ...split(TO_200)];
const W2000 = [...W200, ...split(TO_2000)];

/** Each list, A to Z. */
export const WORDS: Readonly<Record<Size, readonly string[]>> = {
  20: [...W20].sort(),
  200: [...W200].sort(),
  2000: [...W2000].sort(),
};
