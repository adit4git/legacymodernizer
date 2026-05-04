using ContosoStore.Api.Models;
using ContosoStore.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ContosoStore.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ProductsController : ControllerBase
{
    private readonly IProductService _svc;
    public ProductsController(IProductService svc) => _svc = svc;

    [HttpGet]
    public async Task<IActionResult> List([FromQuery] string? category, [FromQuery] int page = 1, [FromQuery] int size = 20)
        => Ok(await _svc.ListAsync(category, page, size));

    [HttpGet("{id:int}")]
    public async Task<IActionResult> Get(int id)
    {
        var p = await _svc.GetAsync(id);
        return p is null ? NotFound() : Ok(p);
    }

    [HttpPost]
    [Authorize(Roles = "Admin,ProductManager")]
    public async Task<IActionResult> Create([FromBody] Product p)
        => CreatedAtAction(nameof(Get), new { id = (await _svc.CreateAsync(p)).Id }, p);

    [HttpPut("{id:int}")]
    [Authorize(Roles = "Admin,ProductManager")]
    public async Task<IActionResult> Update(int id, [FromBody] Product p)
    {
        var updated = await _svc.UpdateAsync(id, p);
        return updated is null ? NotFound() : Ok(updated);
    }

    [HttpDelete("{id:int}")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> Delete(int id)
        => await _svc.DeleteAsync(id) ? NoContent() : NotFound();
}
