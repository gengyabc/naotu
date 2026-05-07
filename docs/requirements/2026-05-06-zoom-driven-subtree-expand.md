# Zoom-Driven Subtree Expand/Collapse

## Focus

选中节点后，滚轮/键盘缩放驱动该节点子树的展开或折叠，类似地图缩放控制信息粒度。未选中节点时保持现有全局缩放行为。

## In Scope

- 选中节点时，滚轮放大 → 递进展开子树，滚轮缩小 → 递进折叠子树
- 递进展开/折叠以相对选中节点的 depth offset 为层级定义
- 递进展开：从根向叶子逐层生效（放大时先展开直接子节点，再逐层向下）
- 递进折叠：从叶子向根逐层生效（缩小时处理某一层时，同时折叠该层及更深层）
- 子树范围：选中节点的所有后代（整个子树）
- 折叠边界：可以折叠到只剩选中节点本身（所有子节点隐藏）
- 展开边界：可以完全展开到所有叶子可见
- 选中节点时：仅触发子树展开/折叠，全局视口不动（不 pan、不改变全局 zoom）
- 操作方式：滚轮直接触发，无需修饰键
- 键盘缩放（Cmd/Ctrl+=/-）也触发子树展开/折叠
- 键盘缩放同时支持主键区和小键盘 +/-
- 当前仅支持单选节点
- 若未来支持多选：仅作用于最后一次交互选中的节点
- 取消选中后：子树保持当前展开/折叠状态
- 缩放驱动的展开/折叠会直接覆盖已有 treeControl
- 放大命中的节点设为 manual-expanded
- 缩小命中的节点设为 manual-collapsed
- auto 仅用于未被显式控制的节点
- 在现有 treeControl auto/manual 逻辑上叠加

## Out of Scope

- 动画过渡（立即生效，无动画）
- 未选中节点时的行为变化（保持现有全局缩放 + semantic zoom）
- 修改全局缩放的范围或速度
- 修改 detail level 映射逻辑
- Minimap 行为变化
- 为当前不存在的多选能力补充实现

## Constraints

- 现有 `buildHierarchy` 提供树结构，`childrenById` / `parentById` 用于遍历子树
- 现有 `treeControl` 字段（auto/manual-expanded/manual-collapsed）继续使用
- `shouldAutoExpandChildren(zoom, depth)` 现有逻辑不删除，新增选中节点时的分支逻辑
- 渲染路径：treeControl 变化 → 重投影 → 重渲染，需确保性能可接受
- 选中节点判断：当前按单选实现；若未来引入多选，则取最后一次交互选中的节点
- 选中节点自身不修改 `treeControl`
- 只有跨过现有缩放层级阈值时才更新子树状态
- 单次输入最多变更有限层数，避免超大子树卡顿

## Assumptions

- 滚轮缩放量与展开/折叠层数成正比，映射规则沿用现有全局缩放的定量方式，仅将作用对象改为选中节点后代
- 子树深度由 `buildHierarchy` 的 `HierarchyNode.depth` 提供
- 展开通过设置命中节点的 `treeControl = manual-expanded` 实现
- 折叠通过设置命中节点的 `treeControl = manual-collapsed` 实现
- 缩放驱动结果作为显式用户编辑，进入 undo/redo、autosave 和持久化
- `Cmd/Ctrl+0` 保持现有全局 reset zoom 行为，不复用于子树展开/折叠

## Success Criteria

- 选中节点 + 滚轮放大：子树从直接子节点开始逐层展开，放大足够多时所有后代可见
- 选中节点 + 滚轮缩小：子树从最深叶子开始逐层折叠，缩小足够多时只剩选中节点本身
- 选中节点时滚轮/键盘缩放不影响全局视口位置和 zoom 值
- 未选中节点时滚轮/键盘行为与现有完全一致
- 若未来支持多选，仅最后一次交互选中的节点子树受影响
- 缩放驱动操作覆盖手动 treeControl 设置
- 取消选中后子树保持当前状态
- 键盘 Cmd/Ctrl+=/- 触发与滚轮相同的子树展开/折叠
- 键盘主键区和小键盘 +/- 均可触发
- `Cmd/Ctrl+0` 行为与当前保持一致
- 现有自动展开/折叠（基于全局 zoom）在未选中节点时仍然正常工作
- 选中节点时，`viewport.zoom` 与 `viewport.pan` 在操作前后完全不变
- 放大后，命中层内节点写为 `manual-expanded`
- 缩小后，命中层及更深层节点写为 `manual-collapsed`
- 操作结果进入 undo/redo，并触发持久化

## Decomposition

1. **读取当前选中节点**：基于现有单选状态读取选中节点 ID；若未来支持多选，则扩展为最后一次交互选中的节点
2. **计算并缓存子树层级结构**：基于 `buildHierarchy`，为选中节点计算每个 depth offset 的子节点集合（offset → nodeIds），并在同一次 selection 生命周期内复用
3. **缩放量映射到展开/折叠层数**：沿用现有滚轮/键盘缩放的定量与阈值规则，将 deltaY 或 factor 映射为应展开/折叠的层数
4. **实现递进展开/折叠**：
   - 放大：从 offset=1 开始，逐层将命中层节点 `treeControl` 设为 `manual-expanded`
   - 缩小：从目标层开始，将该层及更深层节点 `treeControl` 设为 `manual-collapsed`
   - 选中节点自身不参与修改
5. **修改缩放处理逻辑**：在 `handleWheelZoom` 和键盘缩放处增加选中节点判断分支，选中时走子树展开/折叠路径，不走全局缩放；`Cmd/Ctrl+0` 继续保持现有全局 reset zoom 行为
6. **控制更新频率与批量大小**：仅在跨过层级阈值时写入状态，并限制单次输入最多推进/回退有限层数
7. **接入编辑事务**：确保 treeControl 变更进入 undo/redo，并触发 autosave / persistence
8. **集成测试**：验证选中/未选中、放大/缩小、键盘快捷键、视口不变、状态持久化等场景

## Key

zoom-driven-subtree-expand
