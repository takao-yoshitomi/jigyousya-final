-- 既存Supabaseテーブルの安全な構造調整
-- 既存データを保持しながらFlask版互換にする

-- 1. default_tasksテーブルを新しい構造に変更
-- まず新しいカラムを追加
ALTER TABLE public.default_tasks 
ADD COLUMN IF NOT EXISTS accounting_method VARCHAR(255),
ADD COLUMN IF NOT EXISTS tasks JSONB DEFAULT '[]';

-- 既存の個別タスクデータを経理方式別にグループ化して移行
-- （手動でデータ移行後、古いカラムを削除）

-- 2. 必要に応じてインデックスを追加
CREATE INDEX IF NOT EXISTS idx_clients_accounting_method ON public.clients(accounting_method);
CREATE INDEX IF NOT EXISTS idx_default_tasks_accounting_method ON public.default_tasks(accounting_method);

-- 3. 新しいデフォルトタスクデータを挿入（重複回避）
INSERT INTO public.default_tasks (accounting_method, tasks) VALUES
('記帳代行', '["受付", "入力完了", "担当チェック", "不明投げかけ", "月次完了"]'),
('自計', '["データ受領", "担当チェック", "不明投げかけ", "月次完了"]')
ON CONFLICT (accounting_method) DO NOTHING;

-- 4. 既存クライアントの経理方式を正しく設定
UPDATE public.clients 
SET accounting_method = CASE 
    WHEN accounting_method IN ('法人税法', '所得税法') THEN 
        CASE WHEN id % 2 = 0 THEN '自計' ELSE '記帳代行' END
    ELSE accounting_method
END
WHERE accounting_method IN ('法人税法', '所得税法');

-- 5. サンプル月次タスクデータの項目名を更新
-- 記帳代行パターン
UPDATE public.monthly_tasks 
SET tasks = jsonb_build_object(
    '受付', CASE WHEN tasks->>'試算表作成' = '完了' THEN '完了' ELSE '未対応' END,
    '入力完了', CASE WHEN tasks->>'消費税申告書作成' = '完了' THEN '完了' ELSE '未対応' END,
    '担当チェック', CASE WHEN tasks->>'法人税申告書作成' = '完了' THEN '完了' ELSE '進行中' END,
    '不明投げかけ', '未対応',
    '月次完了', '未対応'
)
WHERE client_id IN (
    SELECT id FROM public.clients WHERE accounting_method = '記帳代行'
) AND (tasks ? '試算表作成' OR tasks ? '消費税申告書作成');

-- 自計パターン
UPDATE public.monthly_tasks 
SET tasks = jsonb_build_object(
    'データ受領', CASE WHEN tasks->>'所得税申告書作成' = '完了' THEN '完了' ELSE '未対応' END,
    '担当チェック', CASE WHEN tasks->>'給与計算' = '完了' THEN '完了' ELSE '未対応' END,
    '不明投げかけ', '未対応',
    '月次完了', CASE WHEN tasks->>'所得税申告書作成' = '完了' AND tasks->>'給与計算' = '完了' THEN '完了' ELSE '未対応' END
)
WHERE client_id IN (
    SELECT id FROM public.clients WHERE accounting_method = '自計'
) AND (tasks ? '所得税申告書作成' OR tasks ? '給与計算');

-- 注意: 以下は手動確認後に実行
-- 古いカラムを削除する場合（確認後に実行）
-- ALTER TABLE public.default_tasks 
-- DROP COLUMN IF EXISTS task_name,
-- DROP COLUMN IF EXISTS display_order,
-- DROP COLUMN IF EXISTS is_active;