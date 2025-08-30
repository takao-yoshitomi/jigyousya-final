// Supabase環境設定
// Vercelで環境変数を設定した場合、このファイルを通して管理

export const SUPABASE_CONFIG = {
    // 本番環境ではVercel環境変数から設定される
    // 開発環境では以下の値を使用
    url: 'https://lqwjmlkkdddjnnxnlyfz.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxxd2ptbGtrZGRkam5ueG5seWZ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYyOTI2MjMsImV4cCI6MjA3MTg2ODYyM30.U9OndAw71LEQrYA7KBmBRfmNVtISVDBMvhm8s11wKfg'
};

// Vercel環境変数があれば上書き（将来の拡張用）
if (typeof window !== 'undefined') {
    if (window.SUPABASE_URL) {
        SUPABASE_CONFIG.url = window.SUPABASE_URL;
    }
    if (window.SUPABASE_ANON_KEY) {
        SUPABASE_CONFIG.anonKey = window.SUPABASE_ANON_KEY;
    }
}