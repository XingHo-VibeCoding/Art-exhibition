-- ============================================================================
--  ART EXHIBITION · seed.sql
--  种子脚本 · 先删后建再插入 · 可重复执行（连跑两次不报错）
--
--  执行位置：CloudBase 控制台 → SQL 型数据库 → SQL 编辑器（schema 选 public）
--  ⚠️ 开发期专用。第 20 天部署上线后禁止再执行 —— 它会 DROP 掉真实数据。
--      上线后的数据变更一律用增量 SQL。
--
--  本文件内容由 db/_extract.js + 本生成器从 mvp/index.html 真实数据机器生成，
--  非手打，故不会串行错位。要改数据，改 index.html 后重新生成，不要直接改这里。
--
--  数据量：works 85 条 · likes 8 条 · notes 6 条
--  执行顺序：整段从第 1 行往下全选执行即可（已含 DROP + CREATE）。
-- ============================================================================

-- ========== 第 1 段：先删后建（等价于整份 schema.sql 的清理+建表部分）==========
DROP TABLE IF EXISTS "notes" CASCADE;
DROP TABLE IF EXISTS "likes" CASCADE;
DROP TABLE IF EXISTS "works" CASCADE;

CREATE TABLE "works" (
  "_id"       TEXT        PRIMARY KEY,
  "name"      TEXT        NOT NULL,
  "img"       TEXT        NOT NULL,
  "series"    TEXT        NOT NULL,
  "material"  TEXT        NOT NULL DEFAULT 'print',
  "note"      TEXT        NOT NULL,
  "verse"     TEXT,
  "order"     INTEGER     NOT NULL,
  "createdAt" BIGINT      NOT NULL,
  CONSTRAINT "works_series_enum"
    CHECK ("series" IN ('theology', 'arcana', 'anime-worlds', 'other-works')),
  CONSTRAINT "works_series_order_uniq" UNIQUE ("series", "order")
);

CREATE TABLE "likes" (
  "_id"       TEXT    PRIMARY KEY,
  "workId"    TEXT    NOT NULL,
  "visitorId" TEXT    NOT NULL,
  "createdAt" BIGINT  NOT NULL,
  CONSTRAINT "likes_workId_fk"
    FOREIGN KEY ("workId") REFERENCES "works"("_id") ON DELETE CASCADE,
  CONSTRAINT "likes_workId_visitorId_uniq" UNIQUE ("workId", "visitorId")
);
CREATE INDEX "likes_workId_idx" ON "likes" ("workId");

CREATE TABLE "notes" (
  "_id"       TEXT    PRIMARY KEY,
  "workId"    TEXT    NOT NULL,
  "visitorId" TEXT    NOT NULL,
  "text"      TEXT    NOT NULL,
  "createdAt" BIGINT  NOT NULL,
  CONSTRAINT "notes_workId_fk"
    FOREIGN KEY ("workId") REFERENCES "works"("_id") ON DELETE CASCADE,
  CONSTRAINT "notes_workId_visitorId_uniq" UNIQUE ("workId", "visitorId"),
  CONSTRAINT "notes_text_len" CHECK (char_length("text") <= 50),
  CONSTRAINT "notes_text_not_blank" CHECK (char_length(btrim("text")) > 0)
);
CREATE INDEX "notes_workId_createdAt_idx" ON "notes" ("workId", "createdAt" DESC);


-- ========== 第 2 段：插入种子数据 ==========

-- ---------- works · 85 条（来自 index.html 的真实作品数据）----------
INSERT INTO "works" ("_id","name","img","series","material","note","verse","order","createdAt") VALUES
  ('theology-01-0x0', 'GENESIS I', 'images/theology/配图-实战-神学-创世纪.jpg', 'theology', 'print', '起初，神创造天地，地是空虚混沌，渊面黑暗。神发命令说要有光，光便从黑暗中分开；祂又使水聚在一处，使旱地显露，叫日月星辰各按时候运行。万物不是从偶然而来，乃是在祂的话语中各归其位。', '“要有光，就有了光。”（创世记 1:3）', 1, 1759363200000),
  ('theology-02-0x0', 'GENESIS II', 'images/theology/配图-实战-神学-创世纪2.jpg', 'theology', 'print', '神造出青草、结种子的菜蔬和结果子的树，又造飞鸟、走兽与海中的活物。到了第六日，祂用地上的尘土造人，将生气吹在他鼻孔里，使他成为有灵的活人，并把管理受造之物的托付交给他。世界在祝福中展开，人也在园中承受看守与治理的使命。', '“神就照着自己的形像造人。”（创世记 1:27）', 2, 1759363200000),
  ('theology-03-0x0', 'FALLEN ANGEL', 'images/theology/配图-实战-神学-堕天使.png', 'theology', 'print', '那受造的灵本在荣光之中，却因心里高傲，竟要高举自己的宝座，与至高者同等。于是美丽变为羞辱，光明之子离开本位，翅膀向幽暗坠落。骄傲使受造之物忘记自己不过是受造之物。', '“你何竟从天坠落，明亮之星，早晨之子！”（以赛亚书 14:12）', 3, 1759363200000),
  ('theology-04-0x0', 'EXILE FROM EDEN', 'images/theology/配图-实战-神学-逐出伊甸.png', 'theology', 'print', '女人听了蛇的话，男人也吃了那分别善恶树的果子；他们的眼睛明亮了，便知道自己赤身露体。神在园中寻找他们，他们躲藏起来，罪使人与神隔绝。园门在身后合拢，基路伯守住生命树的道路；然而神仍以皮子遮盖他们，为将来的怜悯留下记号。', '“你本是尘土，仍要归于尘土。”（创世记 3:19）', 4, 1759363200000),
  ('theology-05-0x0', 'CAIN AND ABEL', 'images/theology/配图-实战-神学-该隐与亚伯.png', 'theology', 'print', '该隐种地，亚伯牧羊；二人各自将供物献给耶和华。亚伯和他的供物蒙悦纳，该隐却发怒变了脸色。神警告他说，罪就伏在门前，必恋慕他，他却要制伏罪。只是该隐把弟弟带到田间，举手杀了他；血声从地里上达于神，该隐从此成为流离飘荡的人。', '“你兄弟的血，有声音从地里向我哀告。”（创世记 4:10）', 5, 1759363200000),
  ('theology-06-0x0', 'THE ARK', 'images/theology/配图-实战-神学-方舟.png', 'theology', 'print', '世人终日所思想的尽都是恶，惟有挪亚在耶和华眼前蒙恩。神吩咐他用歌斐木造方舟，带着妻子、儿子和儿妇，并各样活物进入其中。四十昼夜大雨倾下，水势上涨，地上的气息尽都断绝；方舟却在水面上漂行，存留了生命。', '“挪亚就遵着耶和华所吩咐的行了。”（创世记 7:5）', 6, 1759363200000),
  ('theology-07-0x0', 'TOWER OF BABEL', 'images/theology/配图-实战-神学-巴别塔.png', 'theology', 'print', '洪水以后，世人住在示拿平原，彼此同语同言。他们用砖代替石头，彼此商量说，要建造一座城和一座塔，为要传扬自己的名，免得分散在全地。耶和华看见人的骄傲，就变乱他们的口音，使他们彼此不能相通；城因此称为巴别，人也从那里分散到各地。', '“我们要建造一座城和一座塔，塔顶通天。”（创世记 11:4）', 7, 1759363200000),
  ('theology-08-0x0', 'CALLING AND COVENANT', 'images/theology/配图-实战-神学-蒙召立约.png', 'theology', 'print', '耶和华呼召亚伯兰离开本地、本族和父家，往祂所要指示的地去，并应许使他成为大国，叫他的名为大。亚伯兰没有先看见道路，便带着撒莱和一切所有的起行；他住在帐棚里，在应许之地筑坛求告耶和华，以一生的脚步回应那看不见的呼召。', '“你要离开本地、本族、父家，往我所要指示你的地去。”（创世记 12:1）', 8, 1759363200000),
  ('theology-09-0x0', 'THE BINDING OF ISAAC', 'images/theology/配图-实战-神学-以撒的捆绑.png', 'theology', 'print', '神试验亚伯拉罕，叫他带着独生的儿子以撒往摩利亚山去献为燔祭。父子一同上山，以撒问羊羔在哪里，亚伯拉罕回答说神必自己预备。祭坛筑好，柴摆上，刀也举起；天上的使者呼叫他不可伤害童子，亚伯拉罕抬头看见一只公羊，便献上为祭，称那地方为耶和华以勒。', '“神必自己预备作燔祭的羊羔。”（创世记 22:8）', 9, 1759363200000),
  ('theology-10-0x0', 'JACOB''S LADDER', 'images/theology/配图-实战-神学-天梯.png', 'theology', 'print', '雅各离开别是巴，独自走在旷野，夜里以一块石头作枕头。他梦见一个梯子立在地上，梯顶通天，神的使者在其上去下。耶和华站在梯以上，重申给亚伯拉罕的应许，并应许与他同在。雅各醒来，知道这地方可畏，便立石为柱，称那里为伯特利。', '“我与你同在，你无论往哪里去，我必保佑你。”（创世记 28:15）', 10, 1759363200000),
  ('theology-11-0x0', 'PENIEL', 'images/theology/配图-实战-神学-毗努伊勒.png', 'theology', 'print', '雅各听见以扫带着四百人迎面而来，便在雅博渡口把家人送过河，独自留下。夜间有一人来和他摔跤，直到黎明；那人摸了他的大腿窝，使他瘸了，却也为他改名叫以色列。雅各不肯放手，求那人给他祝福；天亮时，他说自己面对面见了神，性命仍得保全。', '“我面对面见了神，我的性命仍得保全。”（创世记 32:30）', 11, 1759363200000),
  ('theology-12-0x0', 'JOB', 'images/theology/配图-实战-神学-约伯.png', 'theology', 'print', '约伯本为完全正直、敬畏神的人，却在一日之间失去儿女、牲畜和财物，身上又长满毒疮。他的朋友轮番解释苦难，约伯仍坚持向神申诉；后来耶和华从旋风中回答他，使他看见受造之物远超过人的测度。约伯在尘土和炉灰中悔改，神使他末后的景况胜过先前。', '“我从前风闻有你，现在亲眼看见你。”（约伯记 42:5）', 12, 1759363200000),
  ('theology-13-0x0', 'THE BURNING BUSH', 'images/theology/配图-实战-神学-燃烧的荆棘.png', 'theology', 'print', '摩西在米甸旷野牧放岳父的羊，来到何烈山，看见荆棘被火烧着却没有烧毁。他转身观看，神从荆棘中呼叫他的名字，吩咐他脱下鞋，因为所站之地是圣地。神记念以色列人在埃及所受的苦，差摩西去见法老，并以“我是自有永有的”显明自己的名。', '“我是自有永有的。”（出埃及记 3:14）', 13, 1759363200000),
  ('theology-14-0x0', 'PASSOVER', 'images/theology/配图-实战-神学-逾越节.png', 'theology', 'print', '以色列人在埃及寄居多年，法老仍不肯让他们去。神吩咐各家取无残疾的羊羔，宰杀它，把血涂在门框和门楣上，并在夜间吃羊羔的肉。那夜耶和华击杀埃及地一切长子，却越过有血为记号的房屋；百姓束上腰带，带着无酵饼，在黑暗中预备离开为奴之地。', '“这血要在你们所住的房屋上作记号。”（出埃及记 12:13）', 14, 1759363200000),
  ('theology-15-0x0', 'CROSSING THE RED SEA', 'images/theology/配图-实战-神学-红海.png', 'theology', 'print', '以色列人出了埃及，法老却带着车马追赶他们。百姓看见前有红海、后有军兵，就惧怕呼求；摩西说，只管站住，看耶和华今日向你们所要施行的救恩。摩西向海伸杖，海水分开，百姓走干地而过，水在左右作了墙垣；追赶的埃及军兵全被海水淹没。', '“耶和华使海水一夜退去。”（出埃及记 14:21）', 15, 1759363200000),
  ('theology-16-0x0', 'MOUNT SINAI', 'images/theology/配图-实战-神学-西奈山.png', 'theology', 'print', '以色列人来到西奈旷野，山上有雷轰、闪电和密云，角声甚大。耶和华在火中降临，召摩西上山，与百姓立约，宣告不可有别的神，不可拜偶像，也当守安息日、孝敬父母。山在震动，百姓站在远处；他们知道自己已经从奴仆之地被领出来，如今要成为属神的子民。', '“我是耶和华你的神，曾将你从埃及地为奴之家领出来。”（出埃及记 20:2）', 16, 1759363200000),
  ('theology-17-0x0', 'THE NATIVITY', 'images/theology/配图-实战-神学-降生.png', 'theology', 'print', '约瑟带着马利亚从拿撒勒往伯利恒报名上册，到了时候，马利亚生下头生的儿子，用布包起来，放在马槽里，因为客店没有地方。夜间牧羊人在野地看守羊群，天使向他们报信，天军同声赞美神；他们急忙去看那婴孩，知道救主已经在卑微之处来到世间。', '“今天在大卫的城里，为你们生了救主，就是主基督。”（路加福音 2:11）', 17, 1759363200000),
  ('theology-18-0x0', 'THE WILDERNESS TEMPTATION', 'images/theology/配图-实战-神学-荒野试探.png', 'theology', 'print', '耶稣受洗以后，被圣灵引到旷野，禁食四十昼夜，后来就饿了。那试探人的来到祂面前，叫祂把石头变作食物，又带祂站在殿顶试探神，还指给祂世上的万国和万国的荣华。耶稣每一次都以经上的话回答，拒绝离开父的旨意；试探既毕，天使来伺候祂。', '“人活着，不是单靠食物，乃是靠神口里所出的一切话。”（马太福音 4:4）', 18, 1759363200000),
  ('theology-19-0x0', 'THE PRODIGAL SON', 'images/theology/配图-实战-神学-浪子回头.png', 'theology', 'print', '小儿子向父亲要了产业，往远方去，在任意放荡中耗尽一切。那地遭遇饥荒，他只得替人放猪，连猪所吃的豆荚也无人给他。他醒悟过来，起身回到父家，预备承认自己的罪。父亲远远看见他，就跑去抱着他的颈项；他吩咐仆人拿上好的袍子、戒指和鞋，又宰了肥牛犊，因为这儿子是死而复活、失而又得的。', '“相离还远，他父亲看见，就动了慈心。”（路加福音 15:20）', 19, 1759363200000),
  ('theology-20-0x0', 'THE LAST SUPPER', 'images/theology/配图-实战-神学-最后的晚餐.png', 'theology', 'print', '逾越节的筵席来到，耶稣和门徒一同坐席。祂拿起饼来祝谢，擘开递给他们，说这是为他们舍的身体；饭后又拿起杯，说这杯是用祂的血所立的新约。门徒尚不明白将要发生的事，主却知道自己将被交在罪人手里，仍以爱坐在他们中间。', '“这是我的身体，为你们舍的；你们也应当如此行，为的是记念我。”（路加福音 22:19）', 20, 1759363200000),
  ('theology-21-0x0', 'JUDGMENT BEFORE THE CROSS', 'images/theology/配图-实战-神学-十字架前的审判.png', 'theology', 'print', '耶稣被带到彼拉多面前，祭司长和差役控告祂。彼拉多查不出祂有什么罪，却因众人的喊声渐渐退让；兵丁给祂穿上紫袍，戴上荆棘冠冕。审判者把祂带出来，说“看哪，这个人”，群众却喊着要把祂钉十字架；真理站在沉默中，人的惧怕却把无罪者交了出去。', '“看哪，这个人！”（约翰福音 19:5）', 21, 1759363200000),
  ('theology-22-0x0', 'CALVARY', 'images/theology/配图-实战-神学-各各他.png', 'theology', 'print', '耶稣背着自己的十字架来到各各他，兵丁把祂钉在那里，左右又钉了两个罪犯。祂为钉祂的人求赦免，把母亲交托给门徒；从午正到申初，遍地都黑暗了。祂尝了醋，就说成了，便低下头，将灵魂交付神。', '“成了。”（约翰福音 19:30）', 22, 1759363200000),
  ('theology-23-0x0', 'THE EMPTY TOMB', 'images/theology/配图-实战-神学-空墓.png', 'theology', 'print', '七日的头一日清早，妇女们带着所预备的香料来到坟墓，看见石头已经从墓门滚开。她们进去，却不见主耶稣的身体；有两个人站在旁边告诉她们，为什么在死人中找活人，祂不在这里，已经复活了。妇女们回去报信，门徒起初以为是胡言，后来却亲眼看见复活的主。', '“他不在这里，已经复活了。”（路加福音 24:6）', 23, 1759363200000),
  ('theology-24-0x0', 'THE ASCENSION', 'images/theology/配图-实战-神学-升天.png', 'theology', 'print', '复活以后，耶稣向门徒显现四十日，讲说神国的事。祂吩咐他们不要离开耶路撒冷，要等候父所应许的圣灵；说完这话，祂在他们眼前被接上升，有一朵云彩把祂接去。门徒仍望着天，天使告诉他们，祂怎样往天上去，也要怎样回来。', '“你们要作我的见证，直到地极。”（使徒行传 1:8）', 24, 1759363200000),
  ('theology-25-0x0', 'PENTECOST', 'images/theology/配图-实战-神学-圣灵降临.png', 'theology', 'print', '五旬节到了，门徒都聚集在一处。忽然从天上有响声下来，好像一阵大风吹过，又有舌头如火焰显现，分开落在各人头上。他们就都被圣灵充满，按着圣灵所赐的口才说起别国的话；从天下各处来的虔诚人听见自己的乡谈，众人惊讶，教会便在那日兴起。', '“他们就都被圣灵充满。”（使徒行传 2:4）', 25, 1759363200000),
  ('theology-26-0x0', 'EZEKIEL''S WHEEL', 'images/theology/配图-实战-神学-以西结之轮.png', 'theology', 'print', '以西结在迦巴鲁河边看见从北方来的暴风，有火随之发出，四个活物在火中往来。活物旁各有轮子，轮中套轮，轮的周围满有眼睛；它们随灵往来，不转身而行。先知在被掳之地看见耶和华的荣耀，知道神的手仍在历史之上。', '“这就是活物的形像，我就知道是基路伯。”（以西结书 10:20）', 26, 1759363200000),
  ('theology-27-0x0', 'THRONE ANGELS', 'images/theology/配图-实战-神学-座天使.png', 'theology', 'print', '乌西雅王崩的那年，以赛亚看见主坐在高高的宝座上，衣裳垂下，充满圣殿。撒拉弗各有六个翅膀，彼此呼喊圣哉，门槛的根基因声音震动，殿充满了烟云。先知因看见自己的污秽而战兢，炭火沾他的嘴唇，他便听见主说，谁肯为我们去；他回答说，我在这里，请差遣我。', '“圣哉！圣哉！圣哉！万军之耶和华。”（以赛亚书 6:3）', 27, 1759363200000),
  ('theology-28-0x0', 'THE LAST JUDGMENT', 'images/theology/配图-实战-神学-最后审判.png', 'theology', 'print', '约翰看见一个白色的大宝座，又看见死了的人，无论大小，都站在宝座前。案卷展开，另有一卷生命册；死人都凭着案卷所记的、照各人所行的受审判。死亡和阴间也被扔在火湖里，旧有的黑暗在公义的光中显露并止息。', '“死了的人都凭着这些案卷所记的，照他们所行的受审判。”（启示录 20:12）', 28, 1759363200000),
  ('theology-29-0x0', 'THE NEW JERUSALEM', 'images/theology/配图-实战-神学-新耶路撒冷.png', 'theology', 'print', '约翰看见新天新地，又看见圣城新耶路撒冷从天而降，预备好了，就如新妇妆饰整齐，等候丈夫。神的帐幕在人间，祂要擦去人一切的眼泪；不再有死亡、悲哀、哭号和疼痛。城中有生命水的河和生命树，神的众仆人要侍奉祂，直到永永远远。', '“神要亲自与他们同在，作他们的神。”（启示录 21:3）', 29, 1759363200000),
  ('arcana-01-494x741', 'THE FOOL', 'images/arcana/01_愚者_0_THE-FOOL_494x741.png', 'arcana', 'print', '轻装上路的人站在悬崖边，脚下的空白既像危险，也像尚未写下的命运。', NULL, 30, 1759363200000),
  ('arcana-02-494x741', 'THE MAGICIAN', 'images/arcana/02_魔术师_I_THE-MAGICIAN_494x741.png', 'arcana', 'print', '桌面上的四种器物把意志、资源与行动聚到一起，魔术从“开始动手”发生。', NULL, 31, 1759363200000),
  ('arcana-03-494x741', 'THE EMPEROR', 'images/arcana/03_皇帝_IV_THE-EMPEROR_494x741.png', 'arcana', 'print', '厚重座椅和硬朗线条建立秩序感，权力在这里首先表现为边界与结构。', NULL, 32, 1759363200000),
  ('arcana-04-494x741', 'THE HIEROPHANT', 'images/arcana/04_教皇_V_THE-HIEROPHANT_494x741.png', 'arcana', 'print', '中心人物被两侧侍从与拱门托起，画面讨论的是传统如何被传递和继承。', NULL, 33, 1759363200000),
  ('arcana-05-494x741', 'THE HANGED MAN', 'images/arcana/05_倒吊人_XII_THE-HANGED-MAN_494x741.png', 'arcana', 'print', '倒置的身体暂停了常规视角，悬挂不再是惩罚，而是一种主动换位的观看。', NULL, 34, 1759363200000),
  ('arcana-06-494x741', 'TEMPERANCE', 'images/arcana/06_节制_XIV_TEMPERANCE_494x741.png', 'arcana', 'print', '两只容器之间的流动形成柔和的平衡，克制让不同力量在同一条线上共存。', NULL, 35, 1759363200000),
  ('arcana-07-494x741', 'JUDGEMENT', 'images/arcana/08_审判_XX_JUDGEMENT_494x741.png', 'arcana', 'print', '向上升起的形体与远处的号角构成召唤感，审判更像一次重新醒来的机会。', NULL, 36, 1759363200000),
  ('arcana-08-0x0', 'THE DEVIL', 'images/arcana/配图-实战-塔罗牌-恶魔.png', 'arcana', 'print', '暗色中心牢牢吸住视线，束缚通过重复的链条和欲望的光泽被具象化。', NULL, 37, 1759363200000),
  ('arcana-09-0x0', 'THE EMPRESS', 'images/arcana/配图-实战-塔罗牌-皇后_III.png', 'arcana', 'print', '丰盛的植物、织物与柔软曲线围绕人物展开，生命力从装饰细节中不断溢出。', NULL, 38, 1759363200000),
  ('arcana-10-0x0', 'STRENGTH', 'images/arcana/配图-实战-塔罗牌-力量.png', 'arcana', 'print', '人物没有压制野兽，而是以平静姿态与它相对，力量因此被画成温柔的控制。', NULL, 39, 1759363200000),
  ('arcana-11-0x0', 'THE LOVERS', 'images/arcana/配图-实战-塔罗牌-恋人.png', 'arcana', 'print', '两个人物被同一束光连接，选择、欲望与关系在对称构图里彼此牵引。', NULL, 40, 1759363200000),
  ('arcana-12-0x0', 'WHEEL OF FORTUNE', 'images/arcana/配图-实战-塔罗牌-命运之轮.png', 'arcana', 'print', '旋转的轮盘把人物、动物和符号推入循环，命运表现为不断改变位置的系统。', NULL, 41, 1759363200000),
  ('arcana-13-0x0', 'THE HIGH PRIESTESS', 'images/arcana/配图-实战-塔罗牌-女祭司.png', 'arcana', 'print', '帷幕、月相与静坐人物共同守住秘密，沉默本身成为这张牌最强的视觉语言。', NULL, 42, 1759363200000),
  ('arcana-14-0x0', 'THE WORLD', 'images/arcana/配图-实战-塔罗牌-世界.png', 'arcana', 'print', '闭合的花环把四方力量收拢到中心，完成不是终点，而是一次完整的循环。', NULL, 43, 1759363200000),
  ('arcana-15-0x0', 'DEATH', 'images/arcana/配图-实战-塔罗牌-死神.png', 'arcana', 'print', '骑士穿过层层人群，黑白对照把结束从恐惧中抽离，转化为明确的阶段更替。', NULL, 44, 1759363200000),
  ('arcana-16-0x0', 'THE TOWER', 'images/arcana/配图-实战-塔罗牌-塔.png', 'arcana', 'print', '高塔被闪电从顶部击穿，稳定的结构在一瞬间暴露出自身的脆弱。', NULL, 45, 1759363200000),
  ('arcana-17-0x0', 'THE SUN', 'images/arcana/配图-实战-塔罗牌-太阳.png', 'arcana', 'print', '巨大的太阳压住画面上方，人物与花朵向光展开，明亮是一种没有遮掩的确认。', NULL, 46, 1759363200000),
  ('arcana-18-0x0', 'THE STAR', 'images/arcana/配图-实战-塔罗牌-星星.png', 'arcana', 'print', '人物把水倒向土地与水面，星群在上方回应，补给和希望由同一条流线连接。', NULL, 47, 1759363200000),
  ('arcana-19-0x0', 'THE HERMIT', 'images/arcana/配图-实战-塔罗牌-隐士.png', 'arcana', 'print', '孤独的行者只携一盏灯前进，四周的留白让寻找变成一种内向的运动。', NULL, 48, 1759363200000),
  ('arcana-20-0x0', 'THE MOON', 'images/arcana/配图-实战-塔罗牌-月亮.png', 'arcana', 'print', '双塔、双狼与水面共同构成夜的入口，月光照亮道路，也保留了不确定性。', NULL, 49, 1759363200000),
  ('arcana-21-0x0', 'THE CHARIOT', 'images/arcana/配图-实战-塔罗牌-战车.png', 'arcana', 'print', '前进的车体由两股相反力量拉动，驾驭不是消除冲突，而是让它们共同向前。', NULL, 50, 1759363200000),
  ('arcana-22-0x0', 'JUSTICE', 'images/arcana/配图-实战-塔罗牌-正义.png', 'arcana', 'print', '秤与剑形成清晰的垂直轴，判断被处理成一种冷静、可被看见的平衡。', NULL, 51, 1759363200000),
  ('cinema-01-0x0', 'PAPRIKA', 'images/cinema/配图-实战-红辣椒-梦幻.png', 'anime-worlds', 'print', '鲜艳角色穿过彩色梦境，现实物件被重新组合成一场自由而危险的游行。', NULL, 52, 1759363200000),
  ('cinema-02-0x0', 'TIME AGENT / FILM CLOCK', 'images/cinema/配图-实战-时光代理人：胶片与钟表之约.png', 'anime-worlds', 'print', '胶片格与钟表刻度彼此咬合，时间在这里既能保存，也能被重新剪接。', NULL, 53, 1759363200000),
  ('cinema-03-0x0', 'TIME AGENT / PAST FRAME', 'images/cinema/配图-实战-时光代理人：照片中的过去.png', 'anime-worlds', 'print', '照片成为进入过去的窄门，人物被固定在影像里，却仍保留着未说完的情绪。', NULL, 54, 1759363200000),
  ('cinema-04-0x0', 'SUMMER FRAME', 'images/cinema/配图-实战-夏日.png', 'anime-worlds', 'print', '明亮的夏日色块制造轻盈表面，人物与风景之间保留着一段适合回忆的距离。', NULL, 55, 1759363200000),
  ('cinema-05-0x0', 'END FIELD', 'images/cinema/配图-实战-游戏-明日方舟终末地2.png', 'anime-worlds', 'print', '角色、装备与荒凉地貌被切成多层叙事，末日世界仍然保留着行动的方向。', NULL, 56, 1759363200000),
  ('atelier-01-0x0', 'FASHION STUDY / I', 'images/atelier/配图-实战-服装设计.png', 'anime-worlds', 'print', '人物被织物、羽饰和金属细节包围，服装不只是装饰，而是角色气质的外化。', NULL, 57, 1759363200000),
  ('atelier-02-0x0', 'FASHION STUDY / II', 'images/atelier/配图-实战-服装设计2.png', 'anime-worlds', 'print', '不同人物共享同一画面，颜色和轮廓像舞台服装一样为每种性格分配位置。', NULL, 58, 1759363200000),
  ('atelier-03-0x0', 'COMPOSITION / FIGURES', 'images/atelier/配图-实战-构图.png', 'anime-worlds', 'print', '人物群像沿对角线展开，视线被服饰纹理牵引，在拥挤中保持了清楚的层次。', NULL, 59, 1759363200000),
  ('atelier-04-0x0', 'MAXIMALISM / I', 'images/atelier/配图-实战-极繁主义-服装设计.png', 'anime-worlds', 'print', '花纹、羽毛与珠饰不断叠加，极繁不是堆满画面，而是让细节拥有自己的节奏。', NULL, 60, 1759363200000),
  ('atelier-05-0x0', 'MAXIMALISM / II', 'images/atelier/配图-实战-极繁主义-服装设计2.png', 'anime-worlds', 'print', '暗色服装与亮色背景形成强烈碰撞，人物像从装饰性风暴里被切出来。', NULL, 61, 1759363200000),
  ('atelier-06-0x0', 'JAPANESE SILHOUETTE', 'images/atelier/配图-实战-日式服装设计.png', 'anime-worlds', 'print', '简洁轮廓、层叠布料和留白共同建立东方气质，身体在静止中显出动作预感。', NULL, 62, 1759363200000),
  ('atelier-07-0x0', 'CRIMSON KIMONO', 'images/atelier/result-1 (29).png', 'anime-worlds', 'print', '红黑和服、樱花与金色饰物层层展开，人物像从一场春日仪式中缓慢回望。', NULL, 63, 1759363200000),
  ('atelier-08-0x0', 'REI / NEON GENESIS', 'images/atelier/result-1 (33).png', 'anime-worlds', 'print', '冷蓝天空与白色装甲形成清晰反差，角色被放在末世建筑和个人记忆之间。', NULL, 64, 1759363200000),
  ('atelier-09-0x0', 'ASUKA / EVA-02', 'images/atelier/result-1 (34).png', 'anime-worlds', 'print', '鲜红机体与橙色头发把画面推向高能状态，人物的锋利感来自姿态与色彩共同施压。', NULL, 65, 1759363200000),
  ('atelier-10-0x0', 'MOONLIT WITCH', 'images/atelier/配图-实战-我的游戏人设而已。。.png', 'anime-worlds', 'print', '蝴蝶、古堡与月光围绕持书的魔女展开，幻想世界在明亮背景中留下柔软的入口。', NULL, 66, 1759363200000),
  ('studies-01-0x0', 'ORDER OF EGYPT', 'images/studies/配图-实战-埃及-秩序.png', 'other-works', 'print', '古老图腾与规整网格叠合在一起，神圣秩序像一台精密仪器持续运转。', NULL, 67, 1759363200000),
  ('cinema-06-0x0', 'INCEPTION / SECOND ROOM', 'images/cinema/配图-实战-盗梦空间2.png', 'other-works', 'print', '倾斜的建筑和被折叠的空间让梦境失去重力，现实只剩下一层可被改写的外壳。', NULL, 68, 1759363200000),
  ('cinema-07-0x0', 'HER', 'images/cinema/配图-实战-电影her.png', 'other-works', 'print', '温暖的色调包住人物的孤独，亲密关系在看不见的声音与可见的城市之间展开。', NULL, 69, 1759363200000),
  ('cinema-08-0x0', 'LOVE IN THE BOUQUET', 'images/cinema/配图-实战-花束般的恋爱2-留白.png', 'other-works', 'print', '大面积留白把两个人的距离放大，日常关系在安静的空隙里显出重量。', NULL, 70, 1759363200000),
  ('cinema-09-0x0', 'AMERICAN PSYCHO / CARD', 'images/cinema/配图-实战-美国精神病人-雨衣名片.png', 'other-works', 'print', '名片、雨衣与冷硬的红色构成身份表演，体面的表面下藏着不稳定的欲望。', NULL, 71, 1759363200000),
  ('cinema-10-0x0', 'INTERSTELLAR', 'images/cinema/配图-实战-星际穿越.png', 'other-works', 'print', '深空背景与微小的人形成比例反差，远行因此既像科学任务，也像情感冒险。', NULL, 72, 1759363200000),
  ('studies-02-0x0', 'RONIN / COLLAGE', 'images/studies/配图-实战-浪人（波点艺术+拼贴艺术）.png', 'other-works', 'print', '浪人的姿态被波点和纸片切开，传统形象在拼贴中获得了新的速度感。', NULL, 73, 1759363200000),
  ('studies-03-0x0', 'SAMURAI / COLLAGE', 'images/studies/配图-实战-武士（波点艺术+拼贴艺术）.png', 'other-works', 'print', '武士轮廓被重复图形包围，沉静的身体与跳跃的表面形成一种有张力的平衡。', NULL, 74, 1759363200000),
  ('sleight-01-0x0', 'PHANTOM DEAL', 'images/sleight/配图-实战-惊天魔盗团：幻影牌局.png', 'other-works', 'print', '扑克牌、眼睛和碎片化人物交错排列，观看像一场不断被转移焦点的魔术。', NULL, 75, 1759363200000),
  ('sleight-02-0x0', 'CONSTRUCTIVIST HEIST', 'images/sleight/配图-实战-惊天魔盗团（构成主义）.jpg', 'other-works', 'print', '斜切色块和强烈文字把行动拆成几何指令，电影海报被处理成一台视觉机器。', NULL, 76, 1759363200000),
  ('sleight-03-0x0', 'P3R / SHADOW TRICK', 'images/sleight/配图-实战-惊天魔盗团（P3R）.png', 'other-works', 'print', '冷色人物与锋利构图制造悬念，阴影像另一组角色，始终在画面边缘伺机出现。', NULL, 77, 1759363200000),
  ('sleight-04-0x0', 'P5R / RED SIGNAL', 'images/sleight/配图-实战-惊天魔盗团（P5R）.png', 'other-works', 'print', '红黑对撞和撕裂文字建立强烈节奏，叛逆感通过版面方向而不是单一符号传达。', NULL, 78, 1759363200000),
  ('sleight-05-0x0', 'CUBIST HEIST', 'images/sleight/配图-实战-惊天魔盗团2-立体主义.png', 'other-works', 'print', '人物、牌面和城市被拆成多个观看角度，立体主义让同一场骗局同时发生在不同平面。', NULL, 79, 1759363200000),
  ('studies-04-0x0', 'SCI-FI / ORBITAL CITY', 'images/studies/配图-实战-科幻.png', 'other-works', 'print', '机械结构与远方天体叠在一起，未来感来自尺度的错位和未知空间的留白。', NULL, 80, 1759363200000),
  ('studies-05-0x0', 'WHALE / STAR JOURNEY', 'images/studies/配图-实战-梦幻星空中的蓝鲸之旅.png', 'other-works', 'print', '鲸鱼漂浮在星海与巨大球体之间，海洋和宇宙被想象成同一片可以呼吸的空间。', NULL, 81, 1759363200000),
  ('studies-06-0x0', 'WHALE / NIGHT SWIM', 'images/studies/配图-实战-夜空下的宇宙鲸泳.png', 'other-works', 'print', '夜空中的鲸群像缓慢移动的星座，低处的人影让这场奇观回到安静的观看现场。', NULL, 82, 1759363200000),
  ('studies-07-0x0', 'OIL PAINT / MATERIAL STUDY', 'images/studies/配图-实战-油画.png', 'other-works', 'print', '厚重笔触和层层叠开的颜料保留了手工痕迹，颜色像材料一样拥有触感。', NULL, 83, 1759363200000),
  ('studies-08-0x0', 'F1 / ACID CIRCUIT', 'images/studies/配图-实战-f1-酸性.png', 'other-works', 'print', '荧光色、速度线和机械部件互相推挤，赛道被转译成一块高饱和度的实验屏幕。', NULL, 84, 1759363200000),
  ('studies-09-0x0', 'LOVE / SIGNAL', 'images/studies/配图-实战-LOVE.png', 'other-works', 'print', '巨大的 LOVE 字样与人物、花朵和强色背景叠合，情感被处理成可以远距离读取的信号。', NULL, 85, 1759363200000);

-- ---------- likes · 8 条 ----------
INSERT INTO "likes" ("_id","workId","visitorId","createdAt") VALUES
  ('like-0001', 'theology-01-0x0', 'visitor-dev-01', 1759363500000),
  ('like-0002', 'theology-01-0x0', 'visitor-dev-02', 1759363920000),
  ('like-0003', 'theology-01-0x0', 'visitor-dev-03', 1759365060000),
  ('like-0004', 'arcana-01-494x741', 'visitor-dev-01', 1759366020000),
  ('like-0005', 'arcana-01-494x741', 'visitor-dev-02', 1759366500000),
  ('like-0006', 'arcana-02-494x741', 'visitor-dev-03', 1759367400000),
  ('like-0007', 'cinema-01-0x0', 'visitor-dev-01', 1759368480000),
  ('like-0008', 'studies-09-0x0', 'visitor-dev-02', 1759368900000);

-- ---------- notes · 6 条 ----------
INSERT INTO "notes" ("_id","workId","visitorId","text","createdAt") VALUES
  ('note-0001', 'theology-01-0x0', 'visitor-dev-01', '光从黑暗里分开的那一刻，画面安静得让人不敢出声。', 1759363680000),
  ('note-0002', 'theology-01-0x0', 'visitor-dev-02', '秩序感很强，像一台精密的机器在缓缓运转。', 1759364460000),
  ('note-0003', 'theology-05-0x0', 'visitor-dev-03', '看久了会觉得水面在动，这是我最喜欢的一张。', 1759365600000),
  ('note-0004', 'arcana-01-494x741', 'visitor-dev-01', '悬崖边的空白比脚下的道路更吸引我。', 1759366920000),
  ('note-0005', 'arcana-16-0x0', 'visitor-dev-04', '高塔被击穿的那一瞬，反而有种解脱感。', 1759367820000),
  ('note-0006', 'cinema-03-0x0', 'visitor-dev-02', '彩色梦境像一场不该被打断的游行。', 1759368660000);


-- ---------- 自检：执行完请跑这三条，肉眼核对 ----------
-- 1) 三张表各多少行（期望 works=85 / likes=8 / notes=6）
--    SELECT 'works' AS t, count(*) FROM "works"
--    UNION ALL SELECT 'likes', count(*) FROM "likes"
--    UNION ALL SELECT 'notes', count(*) FROM "notes";
--
-- 2) 每厅数量（期望 theology 29 / arcana 22 / other-works 19 / anime-worlds 15）
--    SELECT "series", count(*) FROM "works" GROUP BY "series" ORDER BY "series";
--
-- 3) 关联是否通（应该每行都返回对应作品名，若出现 NULL 说明外键断了）
--    SELECT l."_id", w."name", l."visitorId"
--      FROM "likes" l JOIN "works" w ON w."_id" = l."workId"
--     ORDER BY l."createdAt";
--
-- 4) 可重复执行验证：把本文件从头再执行一遍，应无任何报错。
--    再跑一次上面第 1 条，行数应与第一次完全相同（不是翻倍）。
