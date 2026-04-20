// Supabase integration: auth, profiles, DB storage.

const SUPABASE_URL = 'https://guidigowjuqazmqflpsc.supabase.co';
const SUPABASE_KEY = 'sb_publishable_gF8JOZmZ30nwIEEW8xl_yQ_ZxUdraCN';
let supabaseClient = null;
let voidMemories = [];
let voidMemoriesLoaded = false;

function initSupabase() {
  try {
    if (typeof supabase !== 'undefined' && supabase.createClient) {
      supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
      console.log('Supabase client initialized');
    } else {
      console.warn('Supabase JS not loaded');
    }
  } catch (e) {
    console.warn('Supabase init failed:', e);
  }
}

async function signUp(email, password) {
  if (!supabaseClient) return { error: 'No connection' };
  const { data, error } = await supabaseClient.auth.signUp({ email, password });
  if (error) return { error: error.message };
  return { data };
}

async function signIn(email, password) {
  if (!supabaseClient) return { error: 'No connection' };
  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };
  currentUser = data.user;
  await loadProfile();
  return { data };
}

async function signOut() {
  if (!supabaseClient) return;
  await supabaseClient.auth.signOut();
  currentUser = null;
  currentProfile = null;
  identityGlyphData = null;
}

async function loadProfile() {
  if (!supabaseClient || !currentUser) return;
  const { data, error } = await supabaseClient
    .from('profiles').select('*').eq('id', currentUser.id).single();
  if (error && error.code !== 'PGRST116') { console.warn('Profile load error:', error.message); return; }
  currentProfile = data || null;
  identityGlyphData = (data && data.identity_glyph) ? data.identity_glyph : null;
}

async function saveSymbol(glyphData) {
  if (!supabaseClient || !currentUser) return;
  const { error } = await supabaseClient
    .from('profiles').upsert({ id: currentUser.id, identity_glyph: glyphData, updated_at: new Date().toISOString() });
  if (error) console.warn('Symbol save error:', error.message);
  else { identityGlyphData = glyphData; if (currentProfile) currentProfile.identity_glyph = glyphData; }
}

async function checkSession() {
  if (!supabaseClient) return;
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session && session.user) {
    currentUser = session.user;
    await loadProfile();
    return true;
  }
  return false;
}

async function saveMemoryToDB(sentence, isAnon, glyphData) {
  if (!supabaseClient) return;
  try {
    const row = {
      sentence, is_anonymous: isAnon,
      identity_glyph: isAnon ? null : glyphData,
      user_id: currentUser ? currentUser.id : null,
      created_at: new Date().toISOString(),
    };
    const { error } = await supabaseClient.from('memories').insert(row);
    if (error) console.warn('DB save error:', error.message);
    else console.log('Memory saved to DB');
  } catch (e) { console.warn('DB save failed:', e); }
}

async function loadVoidMemories() {
  if (!supabaseClient) return;
  try {
    const { data, error } = await supabaseClient
      .from('memories')
      .select('id, sentence, is_anonymous, identity_glyph, user_id, created_at')
      .order('created_at', { ascending: false }).limit(220);
    if (error) { console.warn('DB load error:', error.message); return; }
    voidMemories = data || [];
    voidMemoriesLoaded = true;
    console.log(`Loaded ${voidMemories.length} memories from void`);
  } catch (e) { console.warn('DB load failed:', e); }
}

async function loadSharedIntoInteract() {
  if (!supabaseClient || !voidMemoriesLoaded) return;
  const shuffledPool = voidMemories.slice().sort(() => Math.random() - 0.5);
  const toLoad = shuffledPool.slice(0, 40);
  for (const vm of toLoad) {
    const alreadyLoaded = memories.some(m => m.dbId === vm.id);
    if (alreadyLoaded) continue;
    await addMemory(vm.sentence, vm.is_anonymous);
    const lastMem = memories[memories.length - 1];
    if (lastMem) {
      lastMem.dbId = vm.id;
      lastMem.isAnonymous = vm.is_anonymous;
      lastMem.ownerId = vm.user_id || null;
      if (!vm.is_anonymous && vm.identity_glyph) lastMem._sharedGlyph = vm.identity_glyph;
    }
  }
}
