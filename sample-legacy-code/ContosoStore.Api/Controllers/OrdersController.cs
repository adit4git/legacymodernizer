using ContosoStore.Api.Models;
using ContosoStore.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ContosoStore.Api.Controllers;

public record PlaceOrderLine(int ProductId, int Qty);
public record PlaceOrderRequest(string Email, List<PlaceOrderLine> Lines);

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class OrdersController : ControllerBase
{
    private readonly IOrderService _svc;
    public OrdersController(IOrderService svc) => _svc = svc;

    [HttpGet("{id:int}")]
    public async Task<IActionResult> Get(int id)
    {
        var o = await _svc.GetAsync(id);
        return o is null ? NotFound() : Ok(o);
    }

    [HttpGet("customer/{email}")]
    public async Task<IActionResult> ListForCustomer(string email)
        => Ok(await _svc.ListForCustomerAsync(email));

    [HttpPost]
    public async Task<IActionResult> Place([FromBody] PlaceOrderRequest req)
    {
        try
        {
            var lines = req.Lines.Select(l => (l.ProductId, l.Qty));
            var order = await _svc.PlaceAsync(req.Email, lines);
            return CreatedAtAction(nameof(Get), new { id = order.Id }, order);
        }
        catch (InvalidOperationException ex) { return BadRequest(new { error = ex.Message }); }
    }

    [HttpPatch("{id:int}/status")]
    [Authorize(Roles = "Admin,Fulfilment")]
    public async Task<IActionResult> UpdateStatus(int id, [FromBody] OrderStatus status)
    {
        var o = await _svc.UpdateStatusAsync(id, status);
        return o is null ? NotFound() : Ok(o);
    }
}
