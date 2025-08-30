-- 現在のSupabaseデータに合わせたカスタム移行SQL
-- 既存の10件のdefault_tasksと5件のclientsを保持しながら新構造に対応

-- ステップ1: バックアップ作成
CREATE TABLE backup_default_tasks AS SELECT * FROM default_tasks;
CREATE TABLE backup_clients AS SELECT * FROM clients;

-- ステップ2: default_tasksテーブルに新カラム追加
ALTER TABLE default_tasks 
ADD COLUMN accounting_method VARCHAR(255),
ADD COLUMN tasks JSONB DEFAULT '[]';

-- ステップ3: 新しい経理方式別デフォルトタスクを追加
INSERT INTO default_tasks (accounting_method, tasks) VALUES
('記帳代行', '["受付", "入力完了", "担当チェック", "不明投げかけ", "月次完了"]'),
('自計', '["データ受領", "担当チェック", "不明投げかけ", "月次完了"]');

-- ステップ4: clientsの経理方式を正しく更新
UPDATE clients 
SET accounting_method = CASE 
    WHEN id IN (1001, 1003, 1004, 1005) THEN '記帳代行'  -- 法人税法 → 記帳代行
    WHEN id = 1002 THEN '自計'                           -- 所得税法 → 自計
    ELSE accounting_method
END;

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

-- ステップ6（オプション）: 古い個別タスクデータの整理
-- 確認後に実行可能
-- DELETE FROM default_tasks WHERE accounting_method IS NULL;

-- 注意: monthly_tasksテーブルがある場合、そちらも項目名の更新が必要
-- 現在のmonthly_tasksの状況を確認してから実行
SELECT client_id, month, tasks FROM monthly_tasks LIMIT 3;