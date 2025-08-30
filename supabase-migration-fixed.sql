-- エラー修正版: 既存バックアップテーブルを考慮した移行SQL

-- ステップ1: バックアップ作成（既存の場合はスキップ）
CREATE TABLE IF NOT EXISTS backup_default_tasks AS SELECT * FROM default_tasks;
CREATE TABLE IF NOT EXISTS backup_clients AS SELECT * FROM clients;

-- ステップ2: default_tasksテーブルに新カラム追加（既存の場合はスキップ）
ALTER TABLE default_tasks 
ADD COLUMN IF NOT EXISTS accounting_method VARCHAR(255),
ADD COLUMN IF NOT EXISTS tasks JSONB DEFAULT '[]';

-- ステップ3: 新しい経理方式別デフォルトタスクを追加（重複回避）
INSERT INTO default_tasks (accounting_method, tasks) VALUES
('記帳代行', '["受付", "入力完了", "担当チェック", "不明投げかけ", "月次完了"]'),
('自計', '["データ受領", "担当チェック", "不明投げかけ", "月次完了"]')
ON CONFLICT (accounting_method) DO NOTHING;

-- ステップ4: clientsの経理方式を正しく更新
UPDATE clients 
SET accounting_method = CASE 
    WHEN id IN (1001, 1003, 1004, 1005) THEN '記帳代行'  -- 法人税法 → 記帳代行
    WHEN id = 1002 THEN '自計'                           -- 所得税法 → 自計
    ELSE accounting_method
END
WHERE accounting_method IN ('法人税法', '所得税法');

-- ステップ5: 結果確認用クエリ
-- 新しいdefault_tasksを確認
SELECT id, accounting_method, tasks 
FROM default_tasks 
WHERE accounting_method IS NOT NULL
ORDER BY accounting_method;

-- 更新されたclientsを確認
SELECT id, name, accounting_method 
FROM clients 
ORDER BY id;