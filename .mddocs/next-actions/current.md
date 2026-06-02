# Next Actions — AugmentorAI

1. **Recreate .venv with Python 3.11** (system python has sqlite3 3.50.4, chromadb works)
   - `uv venv --python 3.11 ~/projects/AugmentorAI/server/.venv`
   - `uv pip install -r ~/projects/AugmentorAI/server/requirements.txt`
   - Pin numpy==1.26.4

2. **Deploy to production** (Oracle VM):
   - Run `sudo ~/projects/AugmentorAI/deploy/deploy.sh` on production VM
   - Add DEEPSEEK_API_KEY to .env.production
   - Restart augmentorai service

3. **Implement confidence scoring** on answers (kanban task t_40d35004)
4. **Build analytics dashboard** (kanban task t_c09cb0d3)
5. **Hermes integration** as AI backend (kanban task t_64c0fcfc)
