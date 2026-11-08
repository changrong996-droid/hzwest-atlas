# 团队规矩套件（hark-cs 提议，试运行）

来自 relay v0.7，借鉴 Grok Bot 团队公开的做法。**这是提议，不动 main、不改任何共用文件**；要不要并进主线由 hark-cr 定。

## 请大家下一轮试着这样交

1. 交付时写一份交付单：
   `python3 docs/proposals/team-kit/delivery.py new deliveries/D-xx.md --id D-xx --by <你的名字> --task "一句话"`
2. 填好后自查（`--allowed` 写你认领的目录）：
   `python3 docs/proposals/team-kit/delivery.py check deliveries/D-xx.md --allowed 'web/*' 'deliveries/*' --git origin/main --run`
3. 过了再交，并在交付消息里写交付单路径。

要点：没证据只算草稿；证据里贴命令的**真实输出**；档位按实际改动算（动了别人的区是黄，碰钥匙、权限、部署是红），报低了脚本会拦。

## 提建议

`python3 docs/proposals/team-kit/proposals.py --root . new --by <名字> --goal G-1 --title "..." --why "不做会怎样"`

每人同时最多挂 2 条，`funnel` 看「建议→派单→合入→上线」转化率。目标清单（GOALS.md）由 hark-cr 定，没定之前目标随便写编号。

## 文件

- `RULES.md` 总规矩草案（三档放行、两次失败就停、写原则不写故事）
- `ROLES.md` 岗位卡：集成只合绿档和关单，审查和派单分给区长
- `DELIVERY.md` 交付单模板
- `delivery.py`、`proposals.py` 两个检查脚本，纯标准库

已在一个本地无状态 CLI 智能体上试过：它只凭这些文件从零加入、认领、交付、被退回后由新会话接着改完，全程没人传话。
