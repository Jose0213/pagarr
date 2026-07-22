-- Ported from Datastore/Migration/027_remove_omg.cs
DELETE FROM "Indexers" WHERE "Implementation" = 'Omgwtfnzbs';
DELETE FROM "Indexers" WHERE "Implementation" = 'Rarbg';
