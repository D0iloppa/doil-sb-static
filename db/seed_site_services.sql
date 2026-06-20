-- site_services 초기 시드 — projects.jsx 스냅샷(2026-06). 1회 실행. 재실행 시 중복 방지 위해 먼저 비운다.
-- 적용: docker exec -i db psql -U doil -d dev -f /path/seed_site_services.sql  (또는 stdin)
TRUNCATE site_services RESTART IDENTITY;

INSERT INTO site_services (type, title, description, href, icon, badge, badge_label, sort_order) VALUES
 ('project','DOPL','Real-time multiplayer game platform (doil playground).','https://dopl.doil.me/','🎮','public','Public',1),
 ('project','Can I Eat?','Intermittent fasting coach — AI decides "can I eat now?".','https://cie.doil.me/','🍽️','public','Public',2),
 ('project','dRec','Meeting recording → Whisper transcription → AI minutes.','https://drec.doil.me/','🎙️','public','Public',3),
 ('project','SandBox Page','Test and sandbox environment page.','/sb/','🐳','public','Public',4),
 ('project','Developer Wiki','History flows on.','/wiki/','📚','public','Public',5),
 ('project','Oh!NO','SaaS landing page and main service portal.','https://ohno.doil.me/landing','🪙','public','Public',6),
 ('project','SaigonRider','Southeast Asia motorcycle community service.','https://saigon.doil.me/','🏍️','public','Public',7),
 ('project','Plane','Project management and issue tracking.','https://plane.doil.me/','✈️','private','Internal',8),
 ('project','Obsidian Sync','LiveSync server (CouchDB). Native apps on each device sync here.','https://docs.doil.me/_utils/','SiObsidian','private','Internal',9),
 ('project','Doybrary','The Library of Alexandria.','https://doybrary.doil.me/','RiBookmarkLine','public','Public',10),
 ('project','Resume','Doil''s résumé (Notion).','https://doiloppa.notion.site/22c3bd6b405d80bab5decf184db29072','SiNotion','public','Public',11),
 ('project','DOYCLOPEDIA','Doil''s knowledge encyclopedia (Notion).','https://doiloppa.notion.site/DOYCLOPEDIA-e8553a423a664a31ba97db9c42265972','SiNotion','public','Public',12),
 ('project','Mattermost','Internal messaging and file-sharing channels.','/mm/','SiMattermost','private','Internal',13),
 ('project','Spring API','Legacy Spring backend on lsh_api (deprecated).','/lsh_api/','SiSpringboot','private','deprecated',14),
 ('project','React App','Legacy React frontend on lsh (deprecated).','/lsh/','FaReact','private','deprecated',15);

INSERT INTO site_services (type, label, href, icon, sort_order) VALUES
 ('social','GITHUB','https://github.com/D0iloppa/','FaGithub',1),
 ('social','BLOG','https://blog.naver.com/kdi3939','SiNaver',2),
 ('social','INSTAGRAM','https://www.instagram.com/d0sigo_/','FaInstagram',3),
 ('social','RESUME','https://doiloppa.notion.site/22c3bd6b405d80bab5decf184db29072','SiNotion',4),
 ('social','LINKEDIN','https://www.linkedin.com/in/도일-권-939bb2301','FaLinkedin',5),
 ('social','DONATE','https://buymeacoffee.com/doil','SiBuymeacoffee',6);
