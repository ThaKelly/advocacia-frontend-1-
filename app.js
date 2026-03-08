import path from "path";
import { fileURLToPath } from "url";
import bodyParser from "body-parser";
import express from "express";
import axios from "axios";
import session from "express-session";
import bcrypt from "bcryptjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Configurações do Express
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
const PORT = 3000;

// URLs da API (Spring Boot)
const apiUrl = 'http://localhost:8080/api/processos';
const apiUrlUsuarios = 'http://localhost:8080/api/usuarios';
const apiUrlAdvogados = 'http://localhost:8080/api/advogados';

// Middlewares
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Configuração de Sessão
app.use(session({
    secret: 'chave-secreta-advocacia',
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 24 * 60 * 60 * 1000 } // 1 dia
}));

// MIDDLEWARE DE PROTEÇÃO (Verifica login e role)
const verificarAutenticacao = (req, res, next) => {
    if (req.session.usuarioLogado) {
        res.locals.user = req.session.usuarioLogado;
        return next();
    }
    res.redirect('/login');
};

// ================= ROTAS DE AUTENTICAÇÃO =================

app.get('/login', (req, res) => {
    res.render('login', { erro: null });
});

app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const response = await axios.get(apiUrlUsuarios);
        const usuarios = response.data;
        const usuarioEncontrado = usuarios.find(u => u.nomeUsuario === username);

        if (usuarioEncontrado && bcrypt.compareSync(password, usuarioEncontrado.senha)) {
            req.session.usuarioLogado = {
                id: usuarioEncontrado.id,
                nome: usuarioEncontrado.nomeUsuario,
                role: usuarioEncontrado.role 
            };
            console.log(`[LOGIN] Usuário ${username} logado com sucesso.`);
            return res.redirect('/');
        }
        
        console.log(`[LOGIN] Tentativa falha para o usuário: ${username}`);
        res.render('login', { erro: 'Usuário ou senha inválidos' });
    } catch (error) {
        console.error('[ERRO] Falha ao conectar no backend Java:', error.message);
        res.render('login', { erro: 'Erro de conexão com o servidor' });
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});


// ================= ROTA PRINCIPAL =================

app.get('/', verificarAutenticacao, async (req, res) => {
    // Captura o erro da URL, se existir
    const mensagemErro = req.query.erro === 'acesso_negado' 
        ? 'Acesso Negado: Apenas administradores podem gerenciar usuários.' 
        : null;

    res.render('index', { mensagemErro });
});

// ================= ADVOGADOS =================

app.get('/advogados', verificarAutenticacao, async (req, res) => {
    try {
        const response = await axios.get(apiUrlAdvogados);
        res.render('lista-advogados', { advogados: response.data });
    } catch (error) {
        res.render('lista-advogados', { advogados: [] });
    }
});

// GET - Tela de cadastro de advogado
app.get('/cadastrar-advogado', verificarAutenticacao, async (req, res) => {
    // Qualquer usuário logado pode ver o formulário
    res.render('cadastrar-advogado', { error: null });
});

// POST - Processar o cadastro do advogado
app.post('/cadastrar-advogado', verificarAutenticacao, async (req, res) => {
    // PROTEÇÃO: Apenas administradores podem cadastrar novos advogados
    if (req.session.usuarioLogado.role !== 'ROLE_ADMIN') {
        return res.status(403).send('Acesso Negado: Apenas administradores podem cadastrar advogados.');
    }

    const { nome, oab, email, telefone, especialidade } = req.body;

    try {
        await axios.post(apiUrlAdvogados, {
            nome,
            oab,
            email,
            telefone,
            especialidade
        });
        
        // Após cadastrar, volta para a lista
        res.redirect('/advogados');
    } catch (error) {
        console.error('Erro ao cadastrar advogado:', error.message);
        res.render('cadastrar-advogado', { 
            error: 'Erro ao salvar advogado no servidor. Verifique os dados e tente novamente.' 
        });
    }
});

app.post('/excluir-advogado/:id', verificarAutenticacao, async (req, res) => {
    if (req.session.usuarioLogado.role !== 'ROLE_ADMIN') return res.status(403).send('Acesso Negado');
    try {
        await axios.delete(`${apiUrlAdvogados}/${req.params.id}`);
        res.redirect('/advogados');
    } catch (error) {
        res.redirect('/advogados');
    }
});

app.get('/editar-advogado/:id', verificarAutenticacao, async (req, res) => {
    try {
        const response = await axios.get(`${apiUrlAdvogados}/${req.params.id}`);
        res.render('editar-advogados', { advogado: response.data });
    } catch (error) {
        res.redirect('/advogados');
    }
});

app.post('/atualizar-advogado/:id', verificarAutenticacao, async (req, res) => {
    try {
        const { nome, oab, email, telefone, especialidade } = req.body;
        await axios.put(`${apiUrlAdvogados}/${req.params.id}`, {
            nome, oab, email, telefone, especialidade
        });
        res.redirect('/advogados');
    } catch (error) {
        res.redirect('/advogados');
    }
});


// ================= PROCESSOS =================

app.get('/processos', verificarAutenticacao, async (req, res) => {
    try {
        const response = await axios.get(apiUrl);
        res.render('lista-processos', { processos: response.data });
    } catch (error) {
        res.render('lista-processos', { processos: [] });
    }
});

// Rota GET para visualizar detalhes de um processo
app.get('/visualizar-processo/:id', verificarAutenticacao, async (req, res) => {
    try {
        const response = await axios.get(`${apiUrl}/${req.params.id}`);
        const processo = response.data;
        res.render('visualizar-processo', { processo });
    } catch (error) {
        console.error('Erro ao buscar detalhes do processo:', error.message);
        res.redirect('/processos');
    }
});

app.get('/cadastrar-processo', verificarAutenticacao, async (req, res) => {
    try {
        const response = await axios.get(apiUrlAdvogados);
        res.render('cadastrarProcesso', { advogados: response.data });
    } catch (error) {
        res.redirect('/processos');
    }
});

app.post('/cadastrar-processo', verificarAutenticacao, async (req, res) => {
    const { numeroProcesso, descricao, objetivo, valorCausa, status, relatorio, advogadoId } = req.body;
    try {
        const processoData = {
            numeroProcesso, descricao, objetivo, 
            valorCausa: parseFloat(valorCausa), status, relatorio,
            advogado: { id: parseInt(advogadoId) }
        };
        await axios.post(apiUrl, processoData);
        res.redirect('/processos'); 
    } catch (error) {
        res.redirect('/processos');
    }
});

app.post('/excluir-processo/:id', verificarAutenticacao, async (req, res) => {
    if (req.session.usuarioLogado.role !== 'ROLE_ADMIN') return res.status(403).send('Acesso Negado');
    try {
        await axios.delete(`${apiUrl}/${req.params.id}`);
        res.redirect('/processos'); 
    } catch (error) {
        res.redirect('/processos');
    }
});

app.get('/editar-processo/:id', verificarAutenticacao, async (req, res) => {
    try {
        const processo = (await axios.get(`${apiUrl}/${req.params.id}`)).data;
        const advogados = (await axios.get(apiUrlAdvogados)).data;
        res.render('editar-processo', { processo, advogados });
    } catch (error) {
        res.redirect('/processos');
    }
});

app.post('/atualizar-processo/:id', verificarAutenticacao, async (req, res) => {
    const { numeroProcesso, descricao, objetivo, valorCausa, status, relatorio, advogadoId } = req.body;
    try {
        const processoData = {
            numeroProcesso, descricao, objetivo,
            valorCausa: parseFloat(valorCausa), status, relatorio,
            advogado: { id: parseInt(advogadoId) }
        };
        await axios.put(`${apiUrl}/${req.params.id}`, processoData);
        res.redirect('/processos'); 
    } catch (error) {
        res.redirect('/processos');
    }
});


// ================= USUÁRIOS =================

app.get('/usuarios', verificarAutenticacao, async (req, res) => {
    // Se não for admin, redireciona para a home com um parâmetro de erro
    if (req.session.usuarioLogado.role !== 'ROLE_ADMIN') {
        return res.redirect('/?erro=acesso_negado');
    }
    
    try {
        const response = await axios.get(apiUrlUsuarios);
        res.render('lista-usuarios', { usuarios: response.data });
    } catch (error) {
        res.render('lista-usuarios', { usuarios: [] });
    }
});

app.get('/cadastrar-usuario', verificarAutenticacao, async (req, res) => {
    res.render('cadastrarUsuario');
});

app.post('/cadastrar-usuario', verificarAutenticacao, async (req, res) => {
    const { nomeUsuario, senha, role } = req.body;
    try {
        const senhaCriptografada = bcrypt.hashSync(senha, 10);
        await axios.post(apiUrlUsuarios, { 
            nomeUsuario, 
            senha: senhaCriptografada, 
            // Se vier 'ADMIN' vira 'ROLE_ADMIN', senão vira 'ROLE_USER'
            role: role === 'ADMIN' ? 'ROLE_ADMIN' : 'ROLE_USER' 
        });
        res.redirect('/usuarios'); 
    } catch (error) {
        res.redirect('/usuarios');
    }
});

app.post('/excluir-usuario/:id', verificarAutenticacao, async (req, res) => {
    if (req.session.usuarioLogado.role !== 'ROLE_ADMIN') return res.status(403).send('Acesso Negado');
    try {
        await axios.delete(`${apiUrlUsuarios}/${req.params.id}`);
        res.redirect('/usuarios');
    } catch (error) {
        res.redirect('/usuarios');
    }
});

app.get('/editar-usuario/:id', verificarAutenticacao, async (req, res) => {
    try {
        const usuario = (await axios.get(`${apiUrlUsuarios}/${req.params.id}`)).data;
        if (usuario.role === 'ROLE_ADMIN') usuario.role = 'ADMIN';
        if (usuario.role === 'ROLE_USER') usuario.role = 'USER';
        res.render('editar-usuario', { usuario });
    } catch (error) {
        res.redirect('/usuarios');
    }
});

app.post('/atualizar-usuario/:id', verificarAutenticacao, async (req, res) => {
    // Proteção: apenas admin edita
    if (req.session.usuarioLogado.role !== 'ROLE_ADMIN') return res.status(403).send('Acesso Negado');

    try {
        const { nomeUsuario, senha, role } = req.body;
        
        const roleFinal = (role === 'ADMIN' || role === 'ROLE_ADMIN') ? 'ROLE_ADMIN' : 'ROLE_USER';

        const usuarioData = {
            nomeUsuario,
            role: roleFinal
        };
        
        if (senha && senha.trim() !== "") {
            usuarioData.senha = bcrypt.hashSync(senha, 10);
        }
        
        await axios.put(`${apiUrlUsuarios}/${req.params.id}`, usuarioData);
        res.redirect('/usuarios');
    } catch (error) {
        console.error("Erro ao atualizar usuário:", error.message);
        res.redirect('/usuarios');
    }
});

app.listen(PORT, () => {
  console.log(`[SERVER] Sistema rodando em http://localhost:${PORT}`);
});