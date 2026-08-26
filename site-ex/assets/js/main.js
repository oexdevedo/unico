document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('scrollBtn');
  const target = document.getElementById('servicos');

  if (!btn || !target) return; // segurança

  btn.addEventListener('click', (e) => {
    e.preventDefault();

    // 1️⃣ Posiciona o “fly” sobre o ponto de clique
    const fly = document.createElement('div');
    fly.className = 'scroll-fly';
    document.body.appendChild(fly);

    const btnRect = btn.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();

    // calcula deslocamento (dx, dy) em pixels
    const dx = targetRect.left + targetRect.width / 2 - (btnRect.left + btnRect.width / 2);
    const dy = targetRect.top + targetRect.height / 2 - (btnRect.top + btnRect.height / 2);

    // define variáveis CSS usadas na animação
    fly.style.setProperty('--dx', `${dx}px`);
    fly.style.setProperty('--dy', `${dy}px`);
    fly.style.left = `${btnRect.left + btnRect.width / 2 - 15}px`;
    fly.style.top = `${btnRect.top + btnRect.height / 2 - 15}px`;

    // 2️⃣ Rola a página de forma suave
    target.scrollIntoView({ behavior: 'smooth' });

    // 3️⃣ Remove o elemento após a animação
    fly.addEventListener('animationend', () => fly.remove());
  });

  // Navegação por teclado nas seções
  const sections = Array.from(document.querySelectorAll('section'));
  
  document.addEventListener('keydown', (e) => {
    // Verifica se as setas foram pressionadas e não estamos em um campo de texto
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
      e.preventDefault();
      
      // Encontra a seção mais próxima do topo da tela
      let currentIndex = 0;
      let minDistance = Infinity;
      
      sections.forEach((section, index) => {
        const rect = section.getBoundingClientRect();
        const distance = Math.abs(rect.top);
        if (distance < minDistance) {
          minDistance = distance;
          currentIndex = index;
        }
      });

      if (e.key === 'ArrowDown') {
        currentIndex = Math.min(currentIndex + 1, sections.length - 1);
      } else if (e.key === 'ArrowUp') {
        currentIndex = Math.max(currentIndex - 1, 0);
      }
      
      sections[currentIndex].scrollIntoView({ behavior: 'smooth' });
    }
  });
});
