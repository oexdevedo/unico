<?php require_once 'includes/header.php'; ?>

<section class="page-header">
    <div class="container">
        <h1>Fale Conosco</h1>
        <p style="font-size: 1.2rem; margin-top: 10px;">Dê o primeiro passo para recuperar o controle da sua vida financeira.</p>
    </div>
</section>

<section style="padding: 80px 0; background-color: #ffffff;">
    <div class="container" style="display: flex; flex-wrap: wrap; gap: 50px;">
        
        <div style="flex: 1; min-width: 300px;">
            <h2 style="color: var(--primary-blue); font-size: 2.2rem; margin-bottom: 20px;">Estamos aqui para ouvir e ajudar.</h2>
            <p style="color: #666; font-size: 1.1rem; margin-bottom: 30px;">
                Preencha o formulário e um de nossos especialistas entrará em contato com você o mais rápido possível. Tudo de forma sigilosa e sem julgamentos.
            </p>
            
            <div style="margin-bottom: 20px; display: flex; align-items: center; gap: 15px;">
                <div style="width: 50px; height: 50px; background-color: var(--primary-gray); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: var(--primary-orange); font-size: 20px;">
                    <i class="fa-brands fa-whatsapp"></i>
                </div>
                <div>
                    <h4 style="color: var(--primary-blue); margin-bottom: 5px;">WhatsApp</h4>
                    <p style="color: #555;">61 98182-0360</p>
                </div>
            </div>
            
            <div style="margin-bottom: 20px; display: flex; align-items: center; gap: 15px;">
                <div style="width: 50px; height: 50px; background-color: var(--primary-gray); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: var(--primary-orange); font-size: 20px;">
                    <i class="fa-solid fa-envelope"></i>
                </div>
                <div>
                    <h4 style="color: var(--primary-blue); margin-bottom: 5px;">E-mail</h4>
                    <p style="color: #555;">contato@exdevedor.com.br</p>
                </div>
            </div>
            
            <div style="margin-bottom: 20px; display: flex; align-items: center; gap: 15px;">
                <div style="width: 50px; height: 50px; background-color: var(--primary-gray); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: var(--primary-orange); font-size: 20px;">
                    <i class="fa-solid fa-location-dot"></i>
                </div>
                <div>
                    <h4 style="color: var(--primary-blue); margin-bottom: 5px;">Endereço</h4>
                    <p style="color: #555;">Instituto SESI SENAI de Tecnologias Educacionais, Setor Bancário Norte - Brasilia DF</p>
                </div>
            </div>
        </div>

        <div style="flex: 1; min-width: 300px;">
            <div class="contact-form" style="max-width: 600px; margin: 0 auto; background: var(--bg-light); padding: 40px; border-radius: 12px; box-shadow: 0 5px 15px rgba(0,0,0,0.05);">
                <form action="#" method="POST">
                    <div class="form-group" style="margin-bottom: 20px;">
                        <label for="nome" style="display: block; margin-bottom: 8px; font-weight: bold; color: var(--primary-blue);">Nome Completo</label>
                        <input type="text" id="nome" name="nome" placeholder="Digite seu nome" required style="width: 100%; padding: 12px; border: 1px solid #ccc; border-radius: 6px;">
                    </div>
                    <div class="form-group" style="margin-bottom: 20px;">
                        <label for="email" style="display: block; margin-bottom: 8px; font-weight: bold; color: var(--primary-blue);">E-mail</label>
                        <input type="email" id="email" name="email" placeholder="Seu melhor e-mail" required style="width: 100%; padding: 12px; border: 1px solid #ccc; border-radius: 6px;">
                    </div>
                    <div class="form-group" style="margin-bottom: 20px;">
                        <label for="telefone" style="display: block; margin-bottom: 8px; font-weight: bold; color: var(--primary-blue);">Telefone / WhatsApp</label>
                        <input type="tel" id="telefone" name="telefone" placeholder="(00) 00000-0000" required style="width: 100%; padding: 12px; border: 1px solid #ccc; border-radius: 6px;">
                    </div>
                    <div class="form-group" style="margin-bottom: 20px;">
                        <label for="mensagem" style="display: block; margin-bottom: 8px; font-weight: bold; color: var(--primary-blue);">Como podemos te ajudar?</label>
                        <textarea id="mensagem" name="mensagem" rows="4" placeholder="Conte brevemente sua situação..." style="width: 100%; padding: 12px; border: 1px solid #ccc; border-radius: 6px;"></textarea>
                    </div>
                    <button type="submit" class="btn btn-primary" style="width: 100%; font-size: 1.1rem; padding: 15px;">Enviar Mensagem</button>
                </form>
            </div>
        </div>

    </div>
</section>

<?php require_once 'includes/footer.php'; ?>
