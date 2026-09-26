export type Language = 'am' | 'en';

export type MessageKey =
  | 'language_prompt'
  | 'choose_service'
  | 'ask_name'
  | 'invalid_name'
  | 'ask_phone'
  | 'invalid_phone'
  | 'confirm_join'
  | 'btn_join'
  | 'btn_cancel'
  | 'joined'
  | 'joined_next'
  | 'position_check'
  | 'not_in_line'
  | 'already_in_line'
  | 'queue_closed'
  | 'promoted'
  | 'you_are_next'
  | 'ahead_1'
  | 'ahead_2'
  | 'ahead_3'
  | 'cancelled_by_owner'
  | 'skipped_no_show'
  | 'generic_error'
  | 'btn_language'
  | 'btn_my_position'
  | 'btn_amharic'
  | 'btn_english'
  | 'completed';

type MessageParams = Record<string, string | number>;

type MessageTemplate = string | ((params: MessageParams) => string);

const messages: Record<Language, Record<MessageKey, MessageTemplate>> = {
  am: {
    language_prompt: 'ቋንቋ ምረጥ / Choose your language:',
    choose_service: 'አገልግሎት ይምረጡ፦',
    ask_name: 'ስምዎ ምንድን ነው?',
    invalid_name: 'እባክዎ እውነተኛ ስምዎን ይጻፉ።',
    ask_phone: 'ስልክ ቁጥርዎ ስንት ነው?',
    invalid_phone: 'እባክዎ ትክክለኛ ስልክ ቁጥር ይጻፉ፡ ለምሳሌ 0912345678።',
    confirm_join: (params) => `${params.name} — ${params.service}። በወረፋ ውስጥ ይቀላቀላሉ?`,
    btn_join: 'ቀላቀል',
    btn_cancel: 'ሰርዝ',
    joined: (params) => `የወረፋ ቦታዎ፦ ${params.n}\nከእርስዎ በፊት፦ ${params.a} ${Number(params.a) === 1 ? 'ሰው' : 'ሰዎች'}\nተራዎ ሲቃረብ መልእክት እንልክልዎታለን።`,
    joined_next: 'ቀጣይ ነዎት። እባክዎ አቅራቢያ ይሁኑ።',
    position_check: (params) => `የወረፋ ቦታዎ፦ ${params.n}\nከእርስዎ በፊት፦ ${params.a} ${Number(params.a) === 1 ? 'ሰው' : 'ሰዎች'}`,
    not_in_line: 'ዛሬ በወረፋ ላይ የሉም። መቀላቀል ይፈልጋሉ?',
    already_in_line: (params) => `አስቀድመው በወረፋ ላይ ነዎት።\nየወረፋ ቦታዎ፦ ${params.n}\nከእርስዎ በፊት፦ ${params.a} ${Number(params.a) === 1 ? 'ሰው' : 'ሰዎች'}`,
    queue_closed: 'አሁን አዲስ ደንበኞችን አንቀበልም። እባክዎ ቆይተው ይሞክሩ።',
    promoted: 'አሁን የእርስዎ ተራ ነው። እባክዎ ይግቡ።',
    you_are_next: 'ቀጣይ ነዎት። እባክዎ ይዘጋጁ።',
    ahead_1: 'ከእርስዎ በፊት 1 ሰው አለ።',
    ahead_2: 'ከእርስዎ በፊት 2 ሰዎች አሉ።',
    ahead_3: 'ከእርስዎ በፊት 3 ሰዎች አሉ።',
    cancelled_by_owner: 'የእርስዎ ስፍራ ተሰርዟል። ስህተት ከሆነ እባክዎ መልእክት ይላኩልን።',
    skipped_no_show: 'ማግኘት አልቻልንም ብለን ወደ ቀጣዩ ሰው ተንቀሳቅሰናል። እንደገና መቀላቀል ከፈለጉ መልእክት ይላኩልን።',
    generic_error: 'ይቅርታ፡ አንድ ስህተት ተፈጥሯል። እባክዎ ድጋሜ ይሞክሩ።',
    btn_language: 'ቋንቋ',
    btn_my_position: 'ቁጥሬ',
    btn_amharic: '🇪🇹 አማርኛ',
    btn_english: '🇬🇧 English',
    completed: 'ስለመጡ እናመሰግናለን።',
  },
  en: {
    language_prompt: 'Choose your language:',
    choose_service: 'Choose a service:',
    ask_name: 'What is your name?',
    invalid_name: 'Please type your real name.',
    ask_phone: 'What is your phone number?',
    invalid_phone: 'Please type a valid phone number, for example 0912345678.',
    confirm_join: (params) => `${params.name} - ${params.service}. Join the line?`,
    btn_join: 'Join',
    btn_cancel: 'Cancel',
    joined: (params) => `Your place in line: ${params.n}\nPeople ahead of you: ${params.a}\nWe will message you when your turn is near.`,
    joined_next: 'You are next in line. Please stay close.',
    position_check: (params) => `Your place in line: ${params.n}\nPeople ahead of you: ${params.a === 1 ? '1 person' : `${params.a} people`}`,
    not_in_line: 'You are not in line today. Want to join?',
    already_in_line: (params) => `You are already in line.\nYour place in line: ${params.n}\nPeople ahead of you: ${params.a === 1 ? '1 person' : `${params.a} people`}`,
    queue_closed: 'We are not taking new customers right now. Please try again later.',
    promoted: 'It is your turn now. Please come in.',
    you_are_next: 'You are next. Please get ready.',
    ahead_1: '1 person is ahead of you.',
    ahead_2: '2 people are ahead of you.',
    ahead_3: '3 people are ahead of you.',
    cancelled_by_owner: 'Your spot was cancelled. If this is a mistake, message us.',
    skipped_no_show: 'We moved to the next person because we could not reach you. Message us to rejoin.',
    generic_error: 'Sorry, something went wrong. Please try again.',
    btn_language: 'Language',
    btn_my_position: 'My position',
    btn_amharic: '🇪🇹 አማርኛ',
    btn_english: '🇬🇧 English',
    completed: 'Thank you for coming.',
  },
};

export function t(language: Language, key: MessageKey, params: MessageParams = {}): string {
  const template = messages[language][key];
  return typeof template === 'function'
    ? template(params)
    : template.replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? ''));
}
